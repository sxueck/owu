import type { Route } from "./+types/mcp";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "MCP Servers - OWU Admin" },
    { name: "description", content: "Manage MCP server configurations" },
  ];
}

type MCPTransport = "stdio" | "sse" | "streamable-http" | "http";

interface MCPKeyValue {
  key: string;
  value: string;
}

interface MCPServerFormValue {
  id: string;
  name: string;
  description: string;
  transport: MCPTransport;
  command: string;
  args: string[];
  env: MCPKeyValue[];
  url: string;
  headers: MCPKeyValue[];
  enabled: boolean;
}

interface LoaderData {
  config: {
    id: string;
    mcpServers: MCPServerFormValue[];
    mcpServerCount: number;
    updatedAt: Date;
    updatedBy: string | null;
  } | null;
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string>;
  values?: {
    servers: MCPServerFormValue[];
  };
}

const TRANSPORT_LABELS: Record<MCPTransport, string> = {
  stdio: "stdio (本地命令)",
  sse: "SSE (Server-Sent Events)",
  "streamable-http": "Streamable HTTP",
  http: "HTTP (标准)",
};

function createMCPServerId(): string {
  return `mcp-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyServer(index = 0): MCPServerFormValue {
  return {
    id: createMCPServerId(),
    name: `MCP Server ${index + 1}`,
    description: "",
    transport: "stdio",
    command: "",
    args: [],
    env: [],
    url: "",
    headers: [],
    enabled: true,
  };
}

function formatTimestamp(value: Date | string | null | undefined): string {
  if (!value) return "未保存";
  return new Date(value).toLocaleString();
}

function buildServersPayload(servers: MCPServerFormValue[]): string {
  return JSON.stringify(
    servers.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      transport: server.transport,
      command: server.command || null,
      args: server.args,
      env: server.env,
      url: server.url || null,
      headers: server.headers,
      enabled: server.enabled,
    }))
  );
}

function parseServerFromConfig(server: {
  id: string;
  name: string;
  description: string;
  transport: MCPTransport;
  command: string | null;
  args: string[];
  env: MCPKeyValue[];
  url: string | null;
  headers: MCPKeyValue[];
  enabled: boolean;
}): MCPServerFormValue {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    command: server.command ?? "",
    args: server.args,
    env: server.env,
    url: server.url ?? "",
    headers: server.headers,
    enabled: server.enabled,
  };
}

export async function loader({ request }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getPublicConfig } = await import("~/lib/server/index.server");
  
  requireAdmin(session);

  const config = await getPublicConfig();
  
  return {
    config: config
      ? {
          id: config.id,
          mcpServers: config.mcpServers.map(parseServerFromConfig),
          mcpServerCount: config.mcpServerCount,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy,
        }
      : null,
  };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const {
    getSystemConfig,
    saveSystemConfig,
    normalizeMCPServerDrafts,
    validateMCPServerConfig,
  } = await import("~/lib/server/index.server");
  const admin = requireAdmin(session);

  const formData = await request.formData();
  const serversPayload = formData.get("serversPayload");

  if (typeof serversPayload !== "string") {
    return {
      errors: { general: "Invalid server payload." },
      values: { servers: [createEmptyServer(0)] },
    };
  }

  let rawServers: Array<{
    id?: string;
    name?: string;
    description?: string;
    transport?: string;
    command?: string | null;
    args?: string[];
    env?: MCPKeyValue[];
    url?: string | null;
    headers?: MCPKeyValue[];
    enabled?: boolean;
  }> = [];

  try {
    const parsed = JSON.parse(serversPayload) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Servers payload must be an array.");
    }
    rawServers = parsed as typeof rawServers;
  } catch (error) {
    return {
      errors: { general: error instanceof Error ? error.message : "Invalid server payload." },
      values: { servers: [createEmptyServer(0)] },
    };
  }

  const currentConfig = await getSystemConfig();
  
  const typedServers = rawServers.map((s) => ({
    ...s,
    transport: s.transport as MCPTransport | undefined,
  }));
  const normalizedServers = normalizeMCPServerDrafts(typedServers);

  for (const server of normalizedServers) {
    const validation = validateMCPServerConfig(server);
    if (!validation.valid) {
      return {
        errors: { general: validation.error || "Validation failed" },
        values: {
          servers: rawServers.map((s, i) => ({
            id: s.id ?? createMCPServerId(),
            name: s.name || `MCP Server ${i + 1}`,
            description: s.description || "",
            transport: (s.transport as MCPTransport) || "stdio",
            command: s.command ?? "",
            args: s.args || [],
            env: s.env || [],
            url: s.url ?? "",
            headers: s.headers || [],
            enabled: s.enabled ?? true,
          })),
        },
      };
    }
  }

  try {
    await saveSystemConfig({
      mcpServers: normalizedServers,
      updatedBy: admin.userId,
      providers: currentConfig?.providers || [],
    });

    return { success: true };
  } catch (error) {
    return {
      errors: {
        general: error instanceof Error ? error.message : "Failed to save configuration. Please try again.",
      },
      values: {
        servers: rawServers.map((s, i) => ({
          id: s.id ?? createMCPServerId(),
          name: s.name || `MCP Server ${i + 1}`,
          description: s.description || "",
          transport: (s.transport as MCPTransport) || "stdio",
          command: s.command ?? "",
          args: s.args || [],
          env: s.env || [],
          url: s.url ?? "",
          headers: s.headers || [],
          enabled: s.enabled ?? true,
        })),
      },
    };
  }
}

export default function AdminMcpPage() {
  const { config } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const seedServers = useMemo(() => {
    if (actionData?.values?.servers) {
      return actionData.values.servers;
    }
    if (config?.mcpServers.length) {
      return config.mcpServers;
    }
    return [];
  }, [actionData?.values?.servers, config?.mcpServers]);

  const serverResetKey = useMemo(() => JSON.stringify(seedServers), [seedServers]);

  const [servers, setServers] = useState<MCPServerFormValue[]>(() => seedServers);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);

  useEffect(() => {
    setServers(seedServers);
  }, [serverResetKey, seedServers]);

  const enabledCount = servers.filter((s) => s.enabled).length;

  function addServer() {
    const newServer = createEmptyServer(servers.length);
    setServers([...servers, newServer]);
    setEditingServerId(newServer.id);
  }

  function deleteServer(id: string) {
    setServers(servers.filter((s) => s.id !== id));
    if (editingServerId === id) {
      setEditingServerId(null);
    }
  }

  function updateServer(id: string, updates: Partial<MCPServerFormValue>) {
    setServers(servers.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  function toggleServerEnabled(id: string) {
    setServers(servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  function addEnvVar(serverId: string) {
    setServers(
      servers.map((s) =>
        s.id === serverId ? { ...s, env: [...s.env, { key: "", value: "" }] } : s
      )
    );
  }

  function updateEnvVar(serverId: string, index: number, key: string, value: string) {
    setServers(
      servers.map((s) =>
        s.id === serverId
          ? {
              ...s,
              env: s.env.map((e, i) => (i === index ? { key, value } : e)),
            }
          : s
      )
    );
  }

  function removeEnvVar(serverId: string, index: number) {
    setServers(
      servers.map((s) =>
        s.id === serverId
          ? { ...s, env: s.env.filter((_, i) => i !== index) }
          : s
      )
    );
  }

  function addHeader(serverId: string) {
    setServers(
      servers.map((s) =>
        s.id === serverId ? { ...s, headers: [...s.headers, { key: "", value: "" }] } : s
      )
    );
  }

  function updateHeader(serverId: string, index: number, key: string, value: string) {
    setServers(
      servers.map((s) =>
        s.id === serverId
          ? {
              ...s,
              headers: s.headers.map((h, i) => (i === index ? { key, value } : h)),
            }
          : s
      )
    );
  }

  function removeHeader(serverId: string, index: number) {
    setServers(
      servers.map((s) =>
        s.id === serverId
          ? { ...s, headers: s.headers.filter((_, i) => i !== index) }
          : s
      )
    );
  }

  const needsCommand = (transport: MCPTransport) => transport === "stdio";
  const needsUrl = (transport: MCPTransport) =>
    transport === "sse" || transport === "streamable-http" || transport === "http";

  return (
    <div className="space-y-8 text-[var(--chat-ink)]">
      {/* Header Section */}
      <div className="border-b border-[var(--chat-line)] pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--chat-forest)]">
              <span className="h-2 w-2 rounded-full bg-[var(--chat-forest)]" />
              MCP 配置
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">MCP 服务器</h1>
            <p className="mt-2 text-[var(--chat-muted)]">管理 Model Context Protocol 服务器配置</p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] px-4 py-3">
              <div className="text-xs text-[var(--chat-muted)]">服务器</div>
              <div className="text-xl font-semibold">{servers.length}</div>
            </div>
            <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] px-4 py-3">
              <div className="text-xs text-[var(--chat-muted)]">已启用</div>
              <div className="text-xl font-semibold">{enabledCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Form method="post" className="space-y-6">
          <input type="hidden" name="serversPayload" value={buildServersPayload(servers)} />

          {actionData?.success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              MCP 服务器保存成功
            </div>
          )}

          {actionData?.errors?.general && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionData.errors.general}
            </div>
          )}

          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-medium">服务器列表</h2>
                <p className="mt-1 text-sm text-[var(--chat-muted)]">
                  配置和管理 MCP 服务器，支持本地命令、SSE 和 HTTP 传输模式
                </p>
              </div>
              <button
                type="button"
                onClick={addServer}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--chat-ink)] transition-colors hover:border-[var(--chat-forest)] hover:bg-[var(--chat-hover-bg)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加服务器
              </button>
            </div>

            {servers.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-[var(--chat-line)] bg-white/50 px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--chat-forest)]/10 text-[var(--chat-forest)]">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium">还没有配置 MCP 服务器</h3>
                <p className="mt-2 text-sm text-[var(--chat-muted)]">
                  点击「添加服务器」配置你的第一个 MCP 服务器
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {servers.map((server, index) => (
                  <div
                    key={server.id}
                    className={`rounded-lg border border-[var(--chat-line)] bg-white p-5 ${
                      !server.enabled ? "opacity-60" : ""
                    }`}
                  >
                    {/* Server Header */}
                    <div className="flex flex-col gap-3 border-b border-[var(--chat-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          server.enabled 
                            ? "bg-[var(--chat-forest)]/10 text-[var(--chat-forest)]" 
                            : "bg-gray-100 text-gray-400"
                        }`}>
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--chat-ink)]">{server.name || `Server ${index + 1}`}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                server.enabled
                                  ? "bg-green-50 text-green-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {server.enabled ? "启用" : "禁用"}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
                            <span className="rounded-full bg-[var(--chat-accent)]/10 px-2 py-0.5 text-[var(--chat-accent)]">
                              {TRANSPORT_LABELS[server.transport]}
                            </span>
                            {server.description && (
                              <span className="truncate max-w-[200px]">{server.description}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start">
                        <button
                          type="button"
                          onClick={() => toggleServerEnabled(server.id)}
                          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            server.enabled
                              ? "border border-[var(--chat-line)] bg-white text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)]"
                              : "bg-[var(--chat-forest)] text-white hover:bg-[#1f463b]"
                          }`}
                        >
                          {server.enabled ? "禁用" : "启用"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingServerId(editingServerId === server.id ? null : server.id)}
                          className="rounded-lg border border-[var(--chat-line)] bg-white px-3 py-1.5 text-sm text-[var(--chat-ink)] transition-colors hover:bg-[var(--chat-hover-bg)]"
                        >
                          {editingServerId === server.id ? "收起" : "编辑"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteServer(server.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-100"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {/* Expandable Form */}
                    {editingServerId === server.id && (
                      <div className="mt-5 space-y-5">
                        {/* Basic Info */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[var(--chat-muted)]">服务器名称</label>
                            <input
                              type="text"
                              value={server.name}
                              onChange={(e) => updateServer(server.id, { name: e.target.value })}
                              className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                              placeholder="My MCP Server"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[var(--chat-muted)]">传输模式</label>
                            <select
                              value={server.transport}
                              onChange={(e) =>
                                updateServer(server.id, { transport: e.target.value as MCPTransport })
                              }
                              className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                            >
                              <option value="stdio">stdio (本地命令)</option>
                              <option value="sse">SSE (Server-Sent Events)</option>
                              <option value="streamable-http">Streamable HTTP</option>
                              <option value="http">HTTP (标准)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-[var(--chat-muted)]">描述</label>
                          <input
                            type="text"
                            value={server.description}
                            onChange={(e) => updateServer(server.id, { description: e.target.value })}
                            className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                            placeholder="可选的服务器描述"
                          />
                        </div>

                        {/* Transport-specific Fields */}
                        {needsCommand(server.transport) && (
                          <div className="space-y-4 rounded-lg border border-[var(--chat-line)] bg-white p-4">
                            <h4 className="text-xs font-medium text-[var(--chat-muted)]">stdio 配置</h4>
                            
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[var(--chat-muted)]">命令</label>
                              <input
                                type="text"
                                value={server.command}
                                onChange={(e) => updateServer(server.id, { command: e.target.value })}
                                className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                                placeholder="npx, uvx, 或可执行文件路径"
                              />
                              <p className="text-xs text-[var(--chat-muted)]">
                                可执行命令，如 npx @modelcontextprotocol/server-filesystem 或 uvx mcp-server-sqlite
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[var(--chat-muted)]">
                                参数（每行一个）
                              </label>
                              <textarea
                                value={server.args.join("\n")}
                                onChange={(e) =>
                                  updateServer(server.id, {
                                    args: e.target.value.split("\n").filter((a) => a.trim()),
                                  })
                                }
                                rows={3}
                                className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                                placeholder="/path/to/directory&#10;--option value"
                              />
                            </div>
                          </div>
                        )}

                        {needsUrl(server.transport) && (
                          <div className="space-y-4 rounded-lg border border-[var(--chat-line)] bg-white p-4">
                            <h4 className="text-xs font-medium text-[var(--chat-muted)]">
                              {server.transport === "sse" ? "SSE" : "HTTP"} 配置
                            </h4>
                            
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[var(--chat-muted)]">URL</label>
                              <input
                                type="url"
                                value={server.url}
                                onChange={(e) => updateServer(server.id, { url: e.target.value })}
                                className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)]"
                                placeholder="https://api.example.com/mcp"
                              />
                            </div>
                          </div>
                        )}

                        {/* Environment Variables */}
                        <div className="space-y-3 rounded-lg border border-[var(--chat-line)] bg-white p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-[var(--chat-ink)]">环境变量</h4>
                            <button
                              type="button"
                              onClick={() => addEnvVar(server.id)}
                              className="text-sm text-[var(--chat-forest)] hover:text-[#1f463b]"
                            >
                              + 添加变量
                            </button>
                          </div>
                          
                          {server.env.length === 0 ? (
                            <p className="text-sm text-[var(--chat-muted)]">没有配置环境变量</p>
                          ) : (
                            <div className="space-y-2">
                              {server.env.map((env, envIndex) => (
                                <div key={envIndex} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={env.key}
                                    onChange={(e) =>
                                      updateEnvVar(server.id, envIndex, e.target.value, env.value)
                                    }
                                    placeholder="KEY"
                                    className="flex-1 rounded-lg border border-[var(--chat-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                  />
                                  <input
                                    type="text"
                                    value={env.value}
                                    onChange={(e) =>
                                      updateEnvVar(server.id, envIndex, env.key, e.target.value)
                                    }
                                    placeholder="value"
                                    className="flex-1 rounded-lg border border-[var(--chat-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeEnvVar(server.id, envIndex)}
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Headers (for remote transports) */}
                        {needsUrl(server.transport) && (
                          <div className="space-y-3 rounded-lg border border-[var(--chat-line)] bg-white p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-[var(--chat-ink)]">HTTP Headers</h4>
                              <button
                                type="button"
                                onClick={() => addHeader(server.id)}
                                className="text-sm text-[var(--chat-forest)] hover:text-[#1f463b]"
                              >
                                + 添加 header
                              </button>
                            </div>
                            
                            {server.headers.length === 0 ? (
                              <p className="text-sm text-[var(--chat-muted)]">没有配置 headers</p>
                            ) : (
                              <div className="space-y-2">
                                {server.headers.map((header, headerIndex) => (
                                  <div key={headerIndex} className="flex gap-2">
                                    <input
                                      type="text"
                                      value={header.key}
                                      onChange={(e) =>
                                        updateHeader(server.id, headerIndex, e.target.value, header.value)
                                      }
                                      placeholder="X-Header-Name"
                                      className="flex-1 rounded-lg border border-[var(--chat-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                    />
                                    <input
                                      type="text"
                                      value={header.value}
                                      onChange={(e) =>
                                        updateHeader(server.id, headerIndex, header.key, e.target.value)
                                      }
                                      placeholder="header value"
                                      className="flex-1 rounded-lg border border-[var(--chat-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeHeader(server.id, headerIndex)}
                                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                                    >
                                      删除
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--chat-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--chat-muted)]">
                保存时会把当前 MCP 服务器列表写入系统配置
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--chat-accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b95b30] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "保存中..." : "保存 MCP 服务器"}
              </button>
            </div>
          </div>
        </Form>

        <aside className="space-y-6">
          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="text-xs font-medium text-[var(--chat-muted)]">状态</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">总服务器</span>
                <span className="font-medium">{servers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">已启用</span>
                <span className="font-medium">{enabledCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">最后更新</span>
                <span className="font-medium">{formatTimestamp(config?.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="text-xs font-medium text-[var(--chat-muted)]">传输类型</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--chat-forest)]" />
                <div>
                  <strong className="text-[var(--chat-ink)]">stdio</strong>
                  <p className="mt-0.5 text-xs text-[var(--chat-muted)]">本地命令执行，适合文件系统、数据库等本地工具</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--chat-accent)]" />
                <div>
                  <strong className="text-[var(--chat-ink)]">SSE / HTTP</strong>
                  <p className="mt-0.5 text-xs text-[var(--chat-muted)]">远程服务连接，适合云端 API 和第三方服务</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <h3 className="text-sm font-medium">关于 MCP</h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--chat-muted)]">
              Model Context Protocol（MCP）是一个开放协议，用于标准化 AI 模型与外部工具、数据源之间的交互。
              配置 MCP 服务器后，系统可以在对话中调用这些工具来扩展 AI 的能力。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
