import type { Route } from "./+types/layout";
import { Form, Link, NavLink, Outlet, useLoaderData } from "react-router";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin - OWU" },
    { name: "description", content: "Admin settings" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");

  const user = requireAdmin(session);

  return { user };
}

export default function AdminLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--color-background)] text-[var(--chat-ink)]">
      <aside className="safe-top safe-bottom z-50 flex w-[260px] flex-col overflow-hidden border-r border-[var(--chat-line)] bg-[var(--chat-sidebar-bg)]">
        <div className="border-b border-[var(--chat-sidebar-border)] px-4 pb-4 pt-5">
          <Link to="/admin" className="min-w-0">
            <div className="pl-2 text-lg font-semibold text-[var(--chat-ink)]">
              OWU Admin
            </div>
          </Link>

          <Link
            to="/chat"
            className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--chat-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 19 3 12m0 0 7-7m-7 7h18" />
            </svg>
            返回对话
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-6">
            {/* Overview Section */}
            <section>
              <div className="px-3 pb-2 text-xs font-medium text-[var(--chat-muted)]">
                概览
              </div>
              <div className="space-y-1">
                <NavLink
                  to="/admin"
                  end
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--chat-panel)] text-[var(--chat-ink)] shadow-sm border border-[var(--chat-line)]"
                        : "text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
                    ].join(" ")
                  }
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
                  </svg>
                  系统概览
                </NavLink>
              </div>
            </section>

            {/* Configuration Section */}
            <section>
              <div className="px-3 pb-2 text-xs font-medium text-[var(--chat-muted)]">
                配置
              </div>
              <div className="space-y-1">
                <NavLink
                  to="/admin/providers"
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--chat-panel)] text-[var(--chat-ink)] shadow-sm border border-[var(--chat-line)]"
                        : "text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
                    ].join(" ")
                  }
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                  模型供应商
                </NavLink>

                <NavLink
                  to="/admin/mcp"
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--chat-panel)] text-[var(--chat-ink)] shadow-sm border border-[var(--chat-line)]"
                        : "text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
                    ].join(" ")
                  }
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  MCP 服务器
                </NavLink>

                <NavLink
                  to="/admin/search"
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--chat-panel)] text-[var(--chat-ink)] shadow-sm border border-[var(--chat-line)]"
                        : "text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
                    ].join(" ")
                  }
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  联网搜索
                </NavLink>
              </div>
            </section>
          </nav>
        </div>

        <div className="border-t border-[var(--chat-sidebar-border)] px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--chat-hover-bg)] transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-panel)] border border-[var(--chat-line)] text-sm font-semibold text-[var(--chat-ink)] shadow-sm">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--chat-ink)]">{user.username}</div>
              <div className="text-xs text-[var(--chat-muted)]">管理员</div>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="rounded-lg p-2 text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)]"
                title="登出"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
                </svg>
              </button>
            </Form>
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--chat-background)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto w-full max-w-[1320px] px-6 py-8 lg:px-10 lg:py-10">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
