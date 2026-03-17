import type { Route } from "./+types/settings";
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "System Settings - OWU Admin" },
    { name: "description", content: "Configure provider settings" },
  ];
}

interface LoaderData {
  config: {
    id: string;
    hasApiKey: boolean;
    openaiBaseUrl: string | null;
    allowedModels: string[];
    providers: Array<{
      id: string;
      label: string;
      hasApiKey: boolean;
      baseUrl: string | null;
      models: string[];
    }>;
    providerCount: number;
    modelCount: number;
    updatedAt: Date;
    updatedBy: string | null;
  } | null;
  isConfigured: boolean;
}

type PublicProvider = NonNullable<LoaderData["config"]>["providers"][number];

interface ProviderFormValue {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  hasStoredApiKey: boolean;
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string>;
  values?: {
    providers: ProviderFormValue[];
  };
}

type ModelSyncResult = { success: boolean; models?: string[]; error?: string };

function createProviderId(): string {
  return `provider-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyProvider(index = 0): ProviderFormValue {
  return {
    id: createProviderId(),
    label: `Provider ${index + 1}`,
    apiKey: "",
    baseUrl: "",
    models: [],
    hasStoredApiKey: false,
  };
}

function toProviderFormValue(provider: PublicProvider): ProviderFormValue {
  return {
    id: provider.id,
    label: provider.label,
    apiKey: "",
    baseUrl: provider.baseUrl ?? "",
    models: provider.models,
    hasStoredApiKey: provider.hasApiKey,
  };
}

function getDefaultProviders(config: LoaderData["config"] | null): ProviderFormValue[] {
  if (config?.providers.length) {
    return config.providers.map((provider) => toProviderFormValue(provider));
  }

  return [createEmptyProvider(0)];
}

function formatTimestamp(value: Date | string | null | undefined): string {
  if (!value) {
    return "Not saved yet";
  }

  return new Date(value).toLocaleString();
}

function buildProvidersPayload(providers: ProviderFormValue[]) {
  return JSON.stringify(
    providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      models: provider.models,
      retainStoredApiKey: provider.hasStoredApiKey && provider.apiKey.trim() === "",
    })),
  );
}

export async function loader({ request }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getPublicConfig, isOpenAIConfigured } = await import("~/lib/server/index.server");
  requireAdmin(session);

  const [config, configured] = await Promise.all([getPublicConfig(), isOpenAIConfigured()]);

  return { config, isConfigured: configured };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getSystemConfig, normalizeProviderDrafts, saveSystemConfig } = await import("~/lib/server/index.server");
  const admin = requireAdmin(session);

  const formData = await request.formData();
  const providersPayload = formData.get("providersPayload");

  if (typeof providersPayload !== "string" || !providersPayload.trim()) {
    return {
      errors: { general: "Provider payload is required." },
      values: { providers: [createEmptyProvider(0)] },
    };
  }

  let rawProviders: Array<{
    id?: string;
    label?: string;
    apiKey?: string;
    baseUrl?: string | null;
    models?: string[];
    retainStoredApiKey?: boolean;
  }> = [];

  try {
    const parsed = JSON.parse(providersPayload) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Providers payload must be an array.");
    }

    rawProviders = parsed as typeof rawProviders;
  } catch (error) {
    return {
      errors: { general: error instanceof Error ? error.message : "Invalid provider payload." },
      values: { providers: [createEmptyProvider(0)] },
    };
  }

  const currentConfig = await getSystemConfig();
  const providers = normalizeProviderDrafts(rawProviders, currentConfig?.providers ?? []);
  const values: ProviderFormValue[] = rawProviders.map((provider, index) => ({
    id: provider.id?.trim() || createProviderId(),
    label: provider.label?.trim() || `Provider ${index + 1}`,
    apiKey: provider.apiKey?.trim() || "",
    baseUrl: provider.baseUrl?.trim() || "",
    models: Array.isArray(provider.models) ? provider.models : [],
    hasStoredApiKey: Boolean(provider.retainStoredApiKey),
  }));

  const errors: Record<string, string> = {};

  if (providers.length === 0) {
    errors.providers = "Add at least one provider before saving.";
  }

  for (const provider of providers) {
    if (!provider.apiKey) {
      errors.providers = `Provider \"${provider.label}\" needs an API key.`;
      break;
    }

    if (provider.models.length === 0) {
      errors.providers = `Provider \"${provider.label}\" has no synced models. Use Sync models first.`;
      break;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { providers: values } };
  }

  try {
    await saveSystemConfig({
      providers,
      updatedBy: admin.userId,
    });

    return { success: true };
  } catch (error) {
    return {
      errors: {
        general: error instanceof Error ? error.message : "Failed to save configuration. Please try again.",
      },
      values: { providers: values },
    };
  }
}

export default function AdminSettingsPage() {
  const { config, isConfigured } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const modelSyncFetcher = useFetcher<ModelSyncResult>();
  const isSubmitting = navigation.state === "submitting";

  const seedProviders = useMemo(
    () => actionData?.values?.providers ?? getDefaultProviders(config),
    [actionData?.values?.providers, config],
  );
  const providerResetKey = useMemo(() => JSON.stringify(seedProviders), [seedProviders]);

  const [providers, setProviders] = useState<
    Array<ProviderFormValue & { isFetchingModels: boolean; fetchError: string | null }>
  >(() => seedProviders.map((provider) => ({ ...provider, isFetchingModels: false, fetchError: null })));
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

  useEffect(() => {
    setProviders(seedProviders.map((provider) => ({ ...provider, isFetchingModels: false, fetchError: null })));
  }, [providerResetKey, seedProviders]);

  useEffect(() => {
    if (modelSyncFetcher.state !== "idle" || !syncingProviderId) {
      return;
    }

    if (modelSyncFetcher.data?.success && modelSyncFetcher.data.models) {
      setProviders((current) =>
        current.map((item) =>
          item.id === syncingProviderId
            ? {
                ...item,
                models: modelSyncFetcher.data?.models ?? [],
                isFetchingModels: false,
                fetchError: null,
              }
            : item,
        ),
      );
    } else {
      setProviders((current) =>
        current.map((item) =>
          item.id === syncingProviderId
            ? {
                ...item,
                isFetchingModels: false,
                fetchError: modelSyncFetcher.data?.error || "Failed to fetch models.",
              }
            : item,
        ),
      );
    }

    setSyncingProviderId(null);
  }, [modelSyncFetcher.data, modelSyncFetcher.state, syncingProviderId]);

  const totalModels = providers.reduce((count, provider) => count + provider.models.length, 0);

  function syncProviderModels(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }

    setProviders((current) =>
      current.map((item) =>
        item.id === providerId ? { ...item, isFetchingModels: true, fetchError: null } : item,
      ),
    );

    setSyncingProviderId(providerId);
    modelSyncFetcher.submit(
      {
        id: provider.id,
        label: provider.label,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        retainStoredApiKey: String(provider.hasStoredApiKey && provider.apiKey.trim() === ""),
      },
      { method: "post", action: "/admin/models" },
    );
  }

  return (
    <div className="space-y-6 text-[var(--chat-ink)]">
      <section className="chat-panel relative overflow-hidden rounded-[30px] px-6 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,103,58,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(37,83,70,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--chat-accent)]" />
              Provider Console
            </div>
            <h1 className="mt-4 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">OpenAI vendor orchestration</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--chat-muted)] sm:text-base">
              管理多个 OpenAI-compatible 供应商
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Providers</div>
              <div className="mt-2 text-2xl font-semibold">{providers.length.toString().padStart(2, "0")}</div>
            </div>
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Models</div>
              <div className="mt-2 text-2xl font-semibold">{totalModels.toString().padStart(2, "0")}</div>
            </div>
            <div className="chat-panel-strong rounded-[22px] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">System</div>
              <div className="mt-2 text-2xl font-semibold">{isConfigured ? "Ready" : "Draft"}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Form method="post" className="space-y-6">
          <input type="hidden" name="providersPayload" value={buildProvidersPayload(providers)} />

          {actionData?.success && (
            <div className="rounded-[24px] border border-[rgba(37,83,70,0.2)] bg-[rgba(37,83,70,0.1)] px-5 py-4 text-sm text-[var(--chat-ink)]">
              Configuration saved successfully.
            </div>
          )}

          {(actionData?.errors?.general || actionData?.errors?.providers) && (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {actionData.errors?.general ?? actionData.errors?.providers}
            </div>
          )}

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl tracking-[-0.02em]">Provider stack</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--chat-muted)]">
                  每个供应商都维护自己的 API key、Base URL 和同步后的模型列表。
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setProviders((current) => [
                    ...current,
                    { ...createEmptyProvider(current.length), isFetchingModels: false, fetchError: null },
                  ])
                }
                className="inline-flex items-center justify-center rounded-full border border-[var(--chat-line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--chat-ink)] hover:bg-white"
              >
                Add provider
              </button>
            </div>

            <div className="mt-6 space-y-5">
              {providers.map((provider, index) => (
                <article key={provider.id} className="chat-panel-strong rounded-[28px] px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex flex-col gap-4 border-b border-[var(--chat-line)] pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Provider {index + 1}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
                        {provider.hasStoredApiKey && (
                          <span className="rounded-full bg-[var(--chat-forest-soft)] px-3 py-1 text-[var(--chat-forest)]">
                            Stored key
                          </span>
                        )}
                        <span>{provider.models.length} synced models</span>
                      </div>
                    </div>

                    {providers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setProviders((current) => current.filter((item) => item.id !== provider.id))}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[var(--chat-ink)]">Vendor name</label>
                      <input
                        type="text"
                        value={provider.label}
                        onChange={(event) =>
                          setProviders((current) =>
                            current.map((item) =>
                              item.id === provider.id ? { ...item, label: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full rounded-[18px] border border-[var(--chat-line)] bg-white/88 px-4 py-3 text-sm outline-none focus:border-[var(--chat-accent)]"
                        placeholder="OpenAI / OneAPI / Azure Proxy"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[var(--chat-ink)]">API key</label>
                      <input
                        type="password"
                        value={provider.apiKey}
                        onChange={(event) =>
                          setProviders((current) =>
                            current.map((item) =>
                              item.id === provider.id ? { ...item, apiKey: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full rounded-[18px] border border-[var(--chat-line)] bg-white/88 px-4 py-3 text-sm outline-none focus:border-[var(--chat-accent)]"
                        placeholder={provider.hasStoredApiKey ? "Leave blank to keep current key" : "sk-..."}
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-[var(--chat-ink)]">Base URL</label>
                      <input
                        type="url"
                        value={provider.baseUrl}
                        onChange={(event) =>
                          setProviders((current) =>
                            current.map((item) =>
                              item.id === provider.id ? { ...item, baseUrl: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full rounded-[18px] border border-[var(--chat-line)] bg-white/88 px-4 py-3 text-sm outline-none focus:border-[var(--chat-accent)]"
                        placeholder="https://api.openai.com/v1"
                      />
                      <p className="text-xs leading-5 text-[var(--chat-muted)]">
                        支持填写根路径或 `/v1` 路径，模型同步会优先请求 `/v1/models`。
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-[var(--chat-line)] bg-white/72 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-[var(--chat-ink)]">Model catalog</div>
                        <p className="mt-1 text-xs leading-5 text-[var(--chat-muted)]">
                          通过服务端代理同步模型，避免手动维护白名单。
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => syncProviderModels(provider.id)}
                        disabled={provider.isFetchingModels}
                        className="inline-flex items-center justify-center rounded-full bg-[var(--chat-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f463b] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {provider.isFetchingModels ? "Syncing..." : "Sync models"}
                      </button>
                    </div>

                    {provider.fetchError && (
                      <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {provider.fetchError}
                      </div>
                    )}

                    {provider.models.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {provider.models.map((model) => (
                          <span
                            key={`${provider.id}-${model}`}
                            className="rounded-full border border-[var(--chat-line)] bg-[rgba(199,103,58,0.08)] px-3 py-1.5 text-xs text-[var(--chat-ink)]"
                          >
                            {model}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[18px] border border-dashed border-[var(--chat-line)] bg-[rgba(255,255,255,0.6)] px-4 py-4 text-sm text-[var(--chat-muted)]">
                        No models synced yet.
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--chat-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--chat-muted)]">保存时会把当前供应商列表写入系统配置，并立即影响 `/chat` 的模型选择。</p>
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
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Runtime</div>
            <div className="mt-4 space-y-4 text-sm text-[var(--chat-ink)]">
              <div>
                <div className="text-[var(--chat-muted)]">Status</div>
                <div className="mt-1 font-medium">{isConfigured ? "Ready for chat" : "Incomplete setup"}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Last updated</div>
                <div className="mt-1 font-medium">{formatTimestamp(config?.updatedAt)}</div>
              </div>
              <div>
                <div className="text-[var(--chat-muted)]">Tracked models</div>
                <div className="mt-1 font-medium">{totalModels}</div>
              </div>
            </div>
          </section>

          <section className="chat-panel rounded-[30px] px-5 py-5 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Flow</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--chat-muted)]">
              <p>1. 填写供应商名称、API key 和 Base URL。</p>
              <p>2. 点击 `Sync models` 从服务端拉取模型列表。</p>
              <p>3. 保存后，`/chat` 会立即展示所有已同步的模型。</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
