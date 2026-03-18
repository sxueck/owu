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
  stdio: "stdio (Local Command)",
  sse: "SSE (Server-Sent Events)",
  "streamable-http": "Streamable HTTP",
  http: "HTTP (Standard)",
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
  if (!value) return "Not saved yet";
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
  
  // Cast transport to proper type for normalization
  const typedServers = rawServers.map((s) => ({
    ...s,
    transport: s.transport as MCPTransport | undefined,
  }));
  const normalizedServers = normalizeMCPServerDrafts(typedServers);

  // Validate all servers
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
    <div className="space-y-6 text-[var(--chat-ink)]">
      {/* Hero Section */}
      <section className="chat-panel relative overflow-hidden rounded-[30px] px-6 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,83,70,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(199,103,58,0.08),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--chat-forest)]" />
              MCP Console
            </div>
            <h1 className="mt-4 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">MCP Server Management</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--chat-muted)] sm:text-base">
              管理 Model Context Protocol 服务器配置，支持多种传输模式。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[240px]">
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Servers</div>
              <div className="mt-2 text-2xl font-semibold">{servers.length.toString().padStart(2, "0")}</div>
            </div>
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Enabled</div>
              <div className="mt-2 text-2xl font-semibold">{enabledCount.toString().padStart(2, "0")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Form method="post" className="space-y-6">
          <input type="hidden" name="serversPayload" value={buildServersPayload(servers)} />

          {actionData?.success && (
            <div className="rounded-[24px] border border-[rgba(37,83,70,0.2)] bg-[rgba(37,83,70,0.1)] px-5 py-4 text-sm text-[var(--chat-ink)]">
              MCP servers saved successfully.
            </div>
          )}

          {actionData?.errors?.general && (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {actionData.errors.general}
            </div>
          )}

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-xl tracking-[-0.02em]">Server registry</h2>
                <p className="mt-1.5 text-sm leading-6 text-[var(--chat-muted)]">
                  配置和管理 MCP 服务器，支持本地命令、SSE 和 HTTP 传输模式。
                </p>
              </div>
              <button
                type="button"
                onClick={addServer}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--chat-ink)] transition-colors hover:bg-white hover:border-[var(--chat-forest)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add server
              </button>
            </div>

            {servers.length === 0 ? (
              <div className="mt-8 rounded-[24px] border border-dashed border-[var(--chat-line)] bg-white/50 px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(37,83,70,0.1)] text-[var(--chat-forest)]">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="mt-4 font-serif text-lg tracking-[-0.02em]">No MCP servers configured</h3>
                <p className="mt-2 text-sm text-[var(--chat-muted)]">
                  Click "Add server" to configure your first MCP server.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {servers.map((server, index) => (
                  <article
                    key={server.id}
                    className={`chat-panel-strong rounded-[24px] px-5 py-5 ${
                      !server.enabled ? "opacity-60" : ""
                    }`}
                  >
                    {/* Server Header */}
                    <div className="flex flex-col gap-3 border-b border-[var(--chat-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          server.enabled 
                            ? "bg-[rgba(37,83,70,0.1)] text-[var(--chat-forest)]" 
                            : "bg-gray-100 text-gray-400"
                        }`}>
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--chat-ink)]">{server.name || `Server ${index + 1}`}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                                server.enabled
                                  ? "bg-[var(--chat-forest-soft)] text-[var(--chat-forest)]"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {server.enabled ? "On" : "Off"}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
                            <span className="rounded-full bg-[rgba(199,103,58,0.08)] px-2 py-0.5 text-[var(--chat-accent)]">
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
                          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                            server.enabled
                              ? "border border-[var(--chat-line)] bg-white/80 text-[var(--chat-ink)] hover:bg-white"
                              : "bg-[var(--chat-forest)] text-white hover:bg-[#1f463b]"
                          }`}
                        >
                          {server.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingServerId(editingServerId === server.id ? null : server.id)}
                          className="rounded-full border border-[var(--chat-line)] bg-white/80 px-3 py-1.5 text-sm text-[var(--chat-ink)] transition-colors hover:bg-white"
                        >
                          {editingServerId === server.id ? "Collapse" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteServer(server.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Expandable Form */}
                    {editingServerId === server.id && (
                      <div className="mt-5 space-y-5">
                        {/* Basic Info */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">Server name</label>
                            <input
                              type="text"
                              value={server.name}
                              onChange={(e) => updateServer(server.id, { name: e.target.value })}
                              className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                              placeholder="My MCP Server"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">Transport</label>
                            <select
                              value={server.transport}
                              onChange={(e) =>
                                updateServer(server.id, { transport: e.target.value as MCPTransport })
                              }
                              className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                            >
                              <option value="stdio">stdio (Local Command)</option>
                              <option value="sse">SSE (Server-Sent Events)</option>
                              <option value="streamable-http">Streamable HTTP</option>
                              <option value="http">HTTP (Standard)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">Description</label>
                          <input
                            type="text"
                            value={server.description}
                            onChange={(e) => updateServer(server.id, { description: e.target.value })}
                            className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                            placeholder="Optional description of this MCP server"
                          />
                        </div>

                        {/* Transport-specific Fields */}
                        {needsCommand(server.transport) && (
                          <div className="space-y-4 rounded-[20px] border border-[var(--chat-line)] bg-white/60 p-4">
                            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">stdio Configuration</h4>
                            
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">Command</label>
                              <input
                                type="text"
                                value={server.command}
                                onChange={(e) => updateServer(server.id, { command: e.target.value })}
                                className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                                placeholder="npx, uvx, or path to executable"
                              />
                              <p className="text-xs leading-5 text-[var(--chat-muted)]">
                                可执行命令，如 npx @modelcontextprotocol/server-filesystem 或 uvx mcp-server-sqlite
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">
                                Arguments (one per line)
                              </label>
                              <textarea
                                value={server.args.join("\n")}
                                onChange={(e) =>
                                  updateServer(server.id, {
                                    args: e.target.value.split("\n").filter((a) => a.trim()),
                                  })
                                }
                                rows={3}
                                className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                                placeholder="/path/to/directory&#10;--option value"
                              />
                            </div>
                          </div>
                        )}

                        {needsUrl(server.transport) && (
                          <div className="space-y-4 rounded-[20px] border border-[var(--chat-line)] bg-white/60 p-4">
                            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">
                              {server.transport === "sse" ? "SSE" : "HTTP"} Configuration
                            </h4>
                            
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">URL</label>
                              <input
                                type="url"
                                value={server.url}
                                onChange={(e) => updateServer(server.id, { url: e.target.value })}
                                className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                                placeholder="https://api.example.com/mcp"
                              />
                            </div>
                          </div>
                        )}

                        {/* Environment Variables */}
                        <div className="space-y-3 rounded-[20px] border border-[var(--chat-line)] bg-white/60 p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-[var(--chat-ink)]">Environment Variables</h4>
                            <button
                              type="button"
                              onClick={() => addEnvVar(server.id)}
                              className="text-sm text-[var(--chat-forest)] hover:text-[#1f463b]"
                            >
                              + Add variable
                            </button>
                          </div>
                          
                          {server.env.length === 0 ? (
                            <p className="text-sm text-[var(--chat-muted)]">No environment variables configured.</p>
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
                                    className="flex-1 rounded-[14px] border border-[var(--chat-line)] bg-white/88 px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                  />
                                  <input
                                    type="text"
                                    value={env.value}
                                    onChange={(e) =>
                                      updateEnvVar(server.id, envIndex, env.key, e.target.value)
                                    }
                                    placeholder="value"
                                    className="flex-1 rounded-[14px] border border-[var(--chat-line)] bg-white/88 px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeEnvVar(server.id, envIndex)}
                                    className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Headers (for remote transports) */}
                        {needsUrl(server.transport) && (
                          <div className="space-y-3 rounded-[20px] border border-[var(--chat-line)] bg-white/60 p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-[var(--chat-ink)]">HTTP Headers</h4>
                              <button
                                type="button"
                                onClick={() => addHeader(server.id)}
                                className="text-sm text-[var(--chat-forest)] hover:text-[#1f463b]"
                              >
                                + Add header
                              </button>
                            </div>
                            
                            {server.headers.length === 0 ? (
                              <p className="text-sm text-[var(--chat-muted)]">No headers configured.</p>
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
                                      className="flex-1 rounded-[14px] border border-[var(--chat-line)] bg-white/88 px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                    />
                                    <input
                                      type="text"
                                      value={header.value}
                                      onChange={(e) =>
                                        updateHeader(server.id, headerIndex, header.key, e.target.value)
                                      }
                                      placeholder="header value"
                                      className="flex-1 rounded-[14px] border border-[var(--chat-line)] bg-white/88 px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeHeader(server.id, headerIndex)}
                                      className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--chat-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--chat-muted)]">
                保存时会把当前 MCP 服务器列表写入系统配置。
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-[var(--chat-accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b95b30] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Save MCP servers"}
              </button>
            </div>
          </section>
        </Form>

        {/* Sidebar */}
        <aside className="space-y-6">
          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Status</div>
            <div className="mt-4 space-y-4 text-sm text-[var(--chat-ink)]">
              <div>
                <div className="text-[var(--chat-muted)]">Total servers</div>
                <div className="mt-1 font-medium">{servers.length}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Enabled</div>
                <div className="mt-1 font-medium">{enabledCount}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Last updated</div>
                <div className="mt-1 font-medium">{formatTimestamp(config?.updatedAt)}</div>
              </div>
            </div>
          </section>

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Transport types</div>
            <div className="mt-4 space-y-3 text-sm text-[var(--chat-muted)]">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--chat-forest)]" />
                <div>
                  <strong className="text-[var(--chat-ink)]">stdio</strong>
                  <p className="mt-0.5 text-xs">本地命令执行，适合文件系统、数据库等本地工具</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--chat-accent)]" />
                <div>
                  <strong className="text-[var(--chat-ink)]">SSE / HTTP</strong>
                  <p className="mt-0.5 text-xs">远程服务连接，适合云端 API 和第三方服务</p>
                </div>
              </div>
            </div>
          </section>

          <section className="chat-panel rounded-[24px] px-5 py-5 sm:px-6">
            <h3 className="text-sm font-medium text-[var(--chat-ink)]">About MCP</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--chat-muted)]">
              Model Context Protocol（MCP）是一个开放协议，用于标准化 AI 模型与外部工具、数据源之间的交互。
              配置 MCP 服务器后，系统可以在对话中调用这些工具来扩展 AI 的能力。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
