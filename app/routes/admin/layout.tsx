import type { Route } from "./+types/layout";
import { Form, Link, Outlet, useLoaderData } from "react-router";
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
    <div className="chat-shell relative min-h-screen overflow-hidden text-[var(--chat-ink)]">
      <div className="pointer-events-none absolute inset-0 chat-dot-grid opacity-35" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-3 lg:flex-row">
        <aside className="chat-panel safe-top safe-bottom flex w-full flex-col rounded-[30px] lg:min-h-[calc(100vh-1.5rem)] lg:w-[320px]">
          <div className="border-b border-[var(--chat-line)] px-5 pb-5 pt-6">
            <Link to="/admin" className="block">
              <div className="font-serif text-[1.45rem] tracking-[-0.02em] text-[var(--chat-ink)]">OWU Control</div>
              <p className="mt-2 text-sm leading-6 text-[var(--chat-muted)]">
                管理员配置面板
              </p>
            </Link>

            <Link
              to="/chat"
              className="chat-input-shadow mt-5 flex items-center justify-between rounded-[20px] bg-[var(--chat-forest)] px-4 py-3 text-sm font-medium text-white hover:bg-[#1f463b]"
            >
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 19 3 12m0 0 7-7m-7 7h18" />
                </svg>
                Back to chat
              </span>
              <span className="rounded-full bg-white/16 px-2 py-1 text-[11px] uppercase tracking-[0.2em]">Live</span>
            </Link>
          </div>

          <div className="px-4 py-5">
            <div className="rounded-[24px] border border-[var(--chat-line)] bg-white/62 p-3">
              <Link
                to="/admin"
                className="flex items-center gap-3 rounded-[18px] bg-[rgba(199,103,58,0.12)] px-4 py-3 text-sm font-medium text-[var(--chat-ink)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/80 text-[var(--chat-accent)]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </span>
                Provider settings
              </Link>
            </div>
          </div>

          <div className="mt-auto border-t border-[var(--chat-line)] px-4 py-4">
            <div className="flex items-center gap-3 rounded-[22px] bg-white/65 px-3 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--chat-accent)] text-sm font-semibold text-white">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--chat-ink)]">{user.username}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--chat-muted)]">Administrator</div>
              </div>
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="rounded-full border border-[var(--chat-line)] p-2 text-[var(--chat-muted)] hover:bg-white"
                  title="Log out"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
                  </svg>
                </button>
              </Form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-3 lg:pb-0">
          <div className="chat-panel min-h-full rounded-[32px] px-4 py-4 sm:px-5 sm:py-5 lg:min-h-[calc(100vh-1.5rem)] lg:px-6 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
