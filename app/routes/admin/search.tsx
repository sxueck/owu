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

  // Get existing API key if not provided (retain stored key)
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
        apiKey: apiKey || undefined, // Only pass new key if provided
        baseUrl: values.baseUrl,
        defaultResultCount: values.defaultResultCount,
      },
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
    <div className="space-y-6 text-[var(--chat-ink)]">
      <section className="chat-panel relative overflow-hidden rounded-[30px] px-6 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,103,58,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(37,83,70,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--chat-accent)]" />
              Search Console
            </div>
            <h1 className="mt-4 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Network search configuration</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--chat-muted)] sm:text-base">
              配置 Exa 联网搜索，让 AI 可以获取最新信息
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[240px]">
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Status</div>
              <div className="mt-2 text-2xl font-semibold">{searchConfig.isConfigured ? "Ready" : "Setup Required"}</div>
            </div>
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Default Results</div>
              <div className="mt-2 text-2xl font-semibold">{searchConfig.defaultResultCount}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Form method="post" className="space-y-6">
          {actionData?.success && (
            <div className="rounded-[24px] border border-[rgba(37,83,70,0.2)] bg-[rgba(37,83,70,0.1)] px-5 py-4 text-sm text-[var(--chat-ink)]">
              Configuration saved successfully.
            </div>
          )}

          {actionData?.error && (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {actionData.error}
            </div>
          )}

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-5">
              <div>
                <h2 className="font-serif text-xl tracking-[-0.02em]">Exa Search</h2>
                <p className="mt-1.5 text-sm leading-6 text-[var(--chat-muted)]">
                  Configure Exa API for network search capabilities in chat.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between rounded-[20px] border border-[var(--chat-line)] bg-white/80 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(199,103,58,0.1)] text-[var(--chat-accent)]">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--chat-ink)]">Enable network search</div>
                    <p className="text-xs text-[var(--chat-muted)]">
                      Allow AI to search the web for up-to-date information
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
                  <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-[var(--chat-accent)] peer-focus:ring-2 peer-focus:ring-[var(--chat-accent)]/20 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                </label>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">
                  Exa API Key
                  {searchConfig.apiKeyPresent && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--chat-forest-soft)] px-2 py-0.5 text-[10px] text-[var(--chat-forest)]">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Saved
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  name="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                  placeholder={searchConfig.apiKeyPresent ? "Leave blank to keep saved key" : "exa-..."}
                  autoComplete="off"
                />
                <p className="text-xs leading-5 text-[var(--chat-muted)]">
                  Get your API key from{" "}
                  <a
                    href="https://exa.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--chat-accent)] hover:underline"
                  >
                    exa.ai
                  </a>
                </p>
              </div>

              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">
                  Base URL
                </label>
                <input
                  type="url"
                  name="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                  placeholder="https://api.exa.ai"
                />
                <p className="text-xs leading-5 text-[var(--chat-muted)]">
                  Exa API endpoint (defaults to https://api.exa.ai)
                </p>
              </div>

              {/* Default Result Count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--chat-muted)]">
                  Default Result Count
                </label>
                <input
                  type="number"
                  name="defaultResultCount"
                  min={1}
                  max={20}
                  value={defaultResultCount}
                  onChange={(e) => setDefaultResultCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))}
                  className="w-full rounded-[16px] border border-[var(--chat-line)] bg-white/90 px-4 py-2.5 text-sm transition-colors outline-none focus:border-[var(--chat-accent)] focus:bg-white"
                />
                <p className="text-xs leading-5 text-[var(--chat-muted)]">
                  Number of search results to include (1-20, default: 5)
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--chat-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--chat-muted)]">
                保存后，用户在 /chat 中可以选择启用联网搜索功能。
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-[var(--chat-accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b95b30] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Save settings"}
              </button>
            </div>
          </section>
        </Form>

        <aside className="space-y-6">
          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Status</div>
            <div className="mt-4 space-y-4 text-sm text-[var(--chat-ink)]">
              <div>
                <div className="text-[var(--chat-muted)]">Configuration</div>
                <div className="mt-1 font-medium">{searchConfig.isConfigured ? "Ready" : "Missing API Key"}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Enabled</div>
                <div className="mt-1 font-medium">{searchConfig.enabled ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Default Results</div>
                <div className="mt-1 font-medium">{searchConfig.defaultResultCount}</div>
              </div>
            </div>
          </section>

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">How it works</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--chat-muted)]">
              <p>1. 获取 Exa API key 并在此配置。</p>
              <p>2. 开启联网搜索开关。</p>
              <p>3. 用户在 /chat 页面会看到网络搜索开关。</p>
              <p>4. 开启后，AI 会在需要时自动调用搜索工具。</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
