import type { Route } from "./+types/search";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useState } from "react";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Search - OWU Admin" },
    { name: "description", content: "Configure search settings" },
  ];
}

interface LoaderData {
  searchConfig: {
    enabled: boolean;
    apiKeyPresent: boolean;
    baseUrl: string | null;
    defaultResultCount: number;
    isConfigured: boolean;
  };
}

interface ActionData {
  success?: boolean;
  error?: string;
  values?: {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    defaultResultCount: number;
  };
}

export async function loader({ request }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getSystemConfig } = await import("~/lib/server/index.server");
  requireAdmin(session);

  const config = await getSystemConfig();

  return {
    searchConfig: {
      enabled: config?.searchConfig?.enabled ?? false,
      apiKeyPresent: config?.searchConfig?.apiKey !== null && (config?.searchConfig?.apiKey?.length ?? 0) > 0,
      baseUrl: config?.searchConfig?.baseUrl ?? null,
      defaultResultCount: config?.searchConfig?.defaultResultCount ?? 5,
      isConfigured: config?.searchConfig?.isConfigured ?? false,
    },
  };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getSystemConfig, saveSystemConfig, normalizeSearchConfigInput } = await import("~/lib/server/index.server");
  const admin = requireAdmin(session);

  const formData = await request.formData();

  const enabled = formData.get("enabled") === "on";
  const apiKey = formData.get("apiKey") as string;
  const baseUrl = formData.get("baseUrl") as string;
  const defaultResultCount = parseInt(formData.get("defaultResultCount") as string, 10) || 5;

  const currentConfig = await getSystemConfig();
  const existingApiKey = currentConfig?.searchConfig?.apiKey;

  const values = {
    enabled,
    apiKey: apiKey || (existingApiKey ?? ""),
    baseUrl: baseUrl || "https://api.exa.ai",
    defaultResultCount: Math.max(1, Math.min(20, defaultResultCount)),
  };

  try {
    await saveSystemConfig({
      searchConfig: {
        enabled,
        apiKey: apiKey || undefined,
        baseUrl: values.baseUrl,
        defaultResultCount: values.defaultResultCount,
      },
      allowEmptyProviders: true,
      updatedBy: admin.userId,
    });

    return { success: true, values };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save search configuration.",
      values,
    };
  }
}

export default function AdminSearchPage() {
  const { searchConfig } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [enabled, setEnabled] = useState(searchConfig.enabled);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(searchConfig.baseUrl || "https://api.exa.ai");
  const [defaultResultCount, setDefaultResultCount] = useState(searchConfig.defaultResultCount);

  return (
    <div className="space-y-8 text-[var(--chat-ink)]">
      {/* Header Section */}
      <div className="border-b border-[var(--chat-line)] pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-purple-600">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              搜索配置
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">联网搜索配置</h1>
            <p className="mt-2 text-[var(--chat-muted)]">配置 Exa 联网搜索，让 AI 可以获取最新信息</p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] px-4 py-3">
              <div className="text-xs text-[var(--chat-muted)]">状态</div>
              <div className="text-xl font-semibold">{searchConfig.isConfigured ? "就绪" : "需配置"}</div>
            </div>
            <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] px-4 py-3">
              <div className="text-xs text-[var(--chat-muted)]">默认结果</div>
              <div className="text-xl font-semibold">{searchConfig.defaultResultCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Form method="post" className="space-y-6">
          {actionData?.success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              配置保存成功
            </div>
          )}

          {actionData?.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionData.error}
            </div>
          )}

          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-5">
              <div>
                <h2 className="text-lg font-medium">Exa 搜索</h2>
                <p className="mt-1 text-sm text-[var(--chat-muted)]">
                  配置 Exa API 以在对话中启用联网搜索功能
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between rounded-lg border border-[var(--chat-line)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--chat-ink)]">启用联网搜索</div>
                    <p className="text-xs text-[var(--chat-muted)]">
                      允许 AI 搜索网络获取最新信息
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-purple-600 peer-focus:ring-2 peer-focus:ring-purple-600/20 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                </label>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chat-muted)]">
                  Exa API Key
                  {searchConfig.apiKeyPresent && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-600">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      已保存
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  name="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-purple-600"
                  placeholder={searchConfig.apiKeyPresent ? "留空保留已保存的 key" : "exa-..."}
                  autoComplete="off"
                />
                <p className="text-xs text-[var(--chat-muted)]">
                  从{" "}
                  <a
                    href="https://exa.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline"
                  >
                    exa.ai
                  </a>{" "}
                  获取你的 API key
                </p>
              </div>

              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chat-muted)]">
                  Base URL
                </label>
                <input
                  type="url"
                  name="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-purple-600"
                  placeholder="https://api.exa.ai"
                />
                <p className="text-xs text-[var(--chat-muted)]">
                  Exa API 端点（默认为 https://api.exa.ai）
                </p>
              </div>

              {/* Default Result Count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chat-muted)]">
                  默认结果数量
                </label>
                <input
                  type="number"
                  name="defaultResultCount"
                  min={1}
                  max={20}
                  value={defaultResultCount}
                  onChange={(e) => setDefaultResultCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))}
                  className="w-full rounded-lg border border-[var(--chat-line)] bg-white px-4 py-2.5 text-sm transition-colors outline-none focus:border-purple-600"
                />
                <p className="text-xs text-[var(--chat-muted)]">
                  搜索结果数量（1-20，默认：5）
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--chat-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--chat-muted)]">
                保存后，用户在对话页面会看到联网搜索开关
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "保存中..." : "保存配置"}
              </button>
            </div>
          </div>
        </Form>

        <aside className="space-y-6">
          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="text-xs font-medium text-[var(--chat-muted)]">状态</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">配置状态</span>
                <span className="font-medium">{searchConfig.isConfigured ? "就绪" : "缺少 API Key"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">已启用</span>
                <span className="font-medium">{searchConfig.enabled ? "是" : "否"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--chat-muted)]">默认结果</span>
                <span className="font-medium">{searchConfig.defaultResultCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
            <div className="text-xs font-medium text-[var(--chat-muted)]">工作流程</div>
            <div className="mt-4 space-y-3 text-sm text-[var(--chat-muted)]">
              <p>1. 获取 Exa API key 并在此配置</p>
              <p>2. 开启联网搜索开关</p>
              <p>3. 用户在对话页面会看到网络搜索开关</p>
              <p>4. 开启后，AI 会在需要时自动调用搜索工具</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
