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
    <div className="space-y-8 text-[var(--chat-ink)]">
      {/* Header Section */}
      <div className="border-b border-[var(--chat-line)] pb-6">
        <div className="flex items-center gap-2 text-sm text-[var(--chat-accent)]">
          <span className="h-2 w-2 rounded-full bg-[var(--chat-accent)]" />
          管理员控制台
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">系统概览</h1>
        <p className="mt-2 text-[var(--chat-muted)]">
          管理 OWU 系统的全局配置
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
          <div className="text-sm text-[var(--chat-muted)]">供应商</div>
          <div className="mt-2 text-3xl font-semibold">{providerCount}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已配置的模型供应商</div>
        </div>

        <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
          <div className="text-sm text-[var(--chat-muted)]">模型</div>
          <div className="mt-2 text-3xl font-semibold">{modelCount}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已同步的模型</div>
        </div>

        <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
          <div className="text-sm text-[var(--chat-muted)]">MCP 服务器</div>
          <div className="mt-2 text-3xl font-semibold">{mcpCount}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">已配置的服务器</div>
        </div>

        <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
          <div className="text-sm text-[var(--chat-muted)]">系统状态</div>
          <div className="mt-2 text-3xl font-semibold">{isConfigured ? "就绪" : "待配置"}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">
            {isConfigured ? "系统已就绪" : "需要配置供应商"}
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/admin/providers"
          className="group flex items-start gap-4 rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-6 transition-all hover:border-[var(--chat-accent)] hover:shadow-sm"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--chat-accent)]/10 text-[var(--chat-accent)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium">模型供应商</h3>
            <p className="mt-1 text-sm text-[var(--chat-muted)]">管理模型供应商和 API 配置</p>
            <div className="mt-3 flex items-center gap-1 text-sm text-[var(--chat-accent)]">
              <span>进入配置</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        <Link
          to="/admin/mcp"
          className="group flex items-start gap-4 rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-6 transition-all hover:border-[var(--chat-forest)] hover:shadow-sm"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--chat-forest)]/10 text-[var(--chat-forest)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium">MCP 服务器</h3>
            <p className="mt-1 text-sm text-[var(--chat-muted)]">管理 Model Context Protocol 服务器配置</p>
            <div className="mt-3 flex items-center gap-1 text-sm text-[var(--chat-forest)]">
              <span>进入配置</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        <Link
          to="/admin/search"
          className="group flex items-start gap-4 rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-6 transition-all hover:border-purple-500 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium">联网搜索</h3>
            <p className="mt-1 text-sm text-[var(--chat-muted)]">配置 Exa 联网搜索功能</p>
            <div className="mt-3 flex items-center gap-1 text-sm text-purple-600">
              <span>进入配置</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Info Section */}
      <div className="rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5">
        <h3 className="text-sm font-medium">关于管理员控制台</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--chat-muted)]">
          管理员控制台用于管理系统的全局配置。配置更改会立即影响所有用户的使用体验。
          建议在进行重要配置变更前，先了解各配置项的作用。
        </p>
      </div>
    </div>
  );
}
