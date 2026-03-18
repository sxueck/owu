import type { Route } from "./+types/overview";
import { Link, useLoaderData } from "react-router";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Overview - OWU" },
    { name: "description", content: "Admin overview and system status" },
  ];
}

interface LoaderData {
  providerCount: number;
  modelCount: number;
  mcpCount: number;
  isConfigured: boolean;
}

export async function loader({ request }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getPublicConfig, isOpenAIConfigured } = await import("~/lib/server/index.server");

  requireAdmin(session);

  const [config, isConfigured] = await Promise.all([getPublicConfig(), isOpenAIConfigured()]);

  const providerCount = config?.providers.length ?? 0;
  const modelCount = config?.providers.reduce((count, provider) => count + provider.models.length, 0) ?? 0;

  // 读取真实已持久化的 MCP 数量
  const mcpCount = config?.mcpServerCount ?? 0;

  return {
    providerCount,
    modelCount,
    mcpCount,
    isConfigured,
  };
}

export default function AdminOverviewPage() {
  const { providerCount, modelCount, mcpCount, isConfigured } = useLoaderData<LoaderData>();

  return (
    <div className="space-y-6 text-[var(--chat-ink)]">
      {/* Hero Section */}
      <section className="chat-panel relative overflow-hidden rounded-[30px] px-6 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,103,58,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(37,83,70,0.12),transparent_28%)]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--chat-accent)]" />
            Admin Console
          </div>
          <h1 className="mt-4 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">System Overview</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--chat-muted)] sm:text-base">
            管理 OWU 系统的全局配置，包括模型供应商和 MCP 服务器设置。
          </p>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="chat-panel-strong rounded-[22px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Providers</div>
          <div className="mt-2 text-3xl font-semibold">{providerCount.toString().padStart(2, "0")}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已配置的供应商</div>
        </div>

        <div className="chat-panel-strong rounded-[22px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">Models</div>
          <div className="mt-2 text-3xl font-semibold">{modelCount.toString().padStart(2, "0")}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已同步的模型</div>
        </div>

        <div className="chat-panel-strong rounded-[22px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">MCP Servers</div>
          <div className="mt-2 text-3xl font-semibold">{mcpCount.toString().padStart(2, "0")}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已配置的服务器</div>
        </div>

        <div className="chat-panel-strong rounded-[22px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--chat-muted)]">System Status</div>
          <div className="mt-2 text-3xl font-semibold">{isConfigured ? "Ready" : "Draft"}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">
            {isConfigured ? "系统就绪" : "待配置"}
          </div>
        </div>
      </section>

      {/* Navigation Cards */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Providers Card */}
        <Link
          to="/admin/providers"
          className="group chat-panel relative overflow-hidden rounded-[30px] p-6 transition-all hover:shadow-lg"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,103,58,0.08),transparent_50%)]" />
          <div className="relative">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(199,103,58,0.12)] text-[var(--chat-accent)]">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
                </svg>
              </div>
              <div>
                <h2 className="font-serif text-xl tracking-[-0.02em]">Providers</h2>
                <p className="mt-1 text-sm text-[var(--chat-muted)]">管理模型供应商和 API 配置</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-[var(--chat-muted)]">
                {providerCount > 0 ? `${providerCount} 个供应商已配置` : "暂无供应商配置"}
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--chat-accent)] group-hover:underline">
                进入配置
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>

        {/* MCP Card */}
        <Link
          to="/admin/mcp"
          className="group chat-panel relative overflow-hidden rounded-[30px] p-6 transition-all hover:shadow-lg"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,83,70,0.08),transparent_50%)]" />
          <div className="relative">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(37,83,70,0.12)] text-[var(--chat-forest)]">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <h2 className="font-serif text-xl tracking-[-0.02em]">MCP Servers</h2>
                <p className="mt-1 text-sm text-[var(--chat-muted)]">管理 Model Context Protocol 服务器配置</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-[var(--chat-muted)]">
                {mcpCount > 0 ? `${mcpCount} 个服务器已配置` : "暂未配置 MCP 服务器"}
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--chat-forest)] group-hover:underline">
                进入配置
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Info Section */}
      <section className="chat-panel rounded-[24px] px-5 py-5 sm:px-6">
        <h3 className="text-sm font-medium text-[var(--chat-ink)]">关于管理员控制台</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--chat-muted)]">
          管理员控制台用于管理系统的全局配置。配置更改会立即影响所有用户的使用体验。
          建议在进行重要配置变更前，先了解各配置项的作用。
        </p>
      </section>
    </div>
  );
}
