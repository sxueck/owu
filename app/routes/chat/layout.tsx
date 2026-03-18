import type { Route } from "./+types/layout";
import { Form, Link, NavLink, Outlet, redirect, useLoaderData, useLocation, useSubmit } from "react-router";
import { getSession } from "~/sessions";
import { useEffect, useMemo, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Chat - OWU" },
    { name: "description", content: "Chat with AI models" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getUserChatSessions } = await import("~/lib/server/ownership.server");

  const user = requireUser(session);
  const sessions = await getUserChatSessions(user);

  return { user, sessions };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser, updateSessionTitle, deleteChatSession } = await import("~/lib/server/index.server");

  const user = requireUser(session);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const sessionId = formData.get("sessionId");
  const title = formData.get("title");
  const returnToValue = formData.get("returnTo");
  const isActiveValue = formData.get("isActive");
  const returnTo = typeof returnToValue === "string" && returnToValue.startsWith("/chat")
    ? returnToValue
    : "/chat";

  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new Response("Session ID required", { status: 400 });
  }

  if (intent === "rename") {
    await updateSessionTitle(user, sessionId, typeof title === "string" ? title : "");
    return redirect(returnTo);
  }

  if (intent === "delete") {
    await deleteChatSession(user, sessionId);
    return redirect(isActiveValue === "true" ? "/chat" : returnTo);
  }

  throw new Response("Unsupported action", { status: 400 });
}

function getSessionGroupLabel(value: Date | string) {
  const date = new Date(value);
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayStart.getTime() - sessionDay.getTime()) / 86400000);

  if (diffDays === 0) {
    return "今天";
  }

  if (diffDays === 1) {
    return "昨天";
  }

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatSessionTitle(title: string) {
  const plainTitle = title
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return plainTitle || "New Chat";
}

export default function ChatLayout() {
  const { user, sessions } = useLoaderData<typeof loader>();
  const location = useLocation();
  const submit = useSubmit();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 960);
      if (window.innerWidth >= 960) {
        setIsMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-sidebar]") && !target.closest("[data-menu-button]")) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!openMenuSessionId) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-session-menu-root]")) {
        setOpenMenuSessionId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuSessionId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuSessionId]);

  useEffect(() => {
    setOpenMenuSessionId(null);
  }, [location.pathname]);

  const sessionGroups = useMemo(() => {
    const groups = new Map<string, typeof sessions>();

    sessions.forEach((session) => {
      const label = getSessionGroupLabel(session.updatedAt);
      const current = groups.get(label) ?? [];
      current.push(session);
      groups.set(label, current);
    });

    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }, [sessions]);

  const submitSessionAction = ({
    intent,
    sessionId,
    title,
    isActive,
  }: {
    intent: "rename" | "delete";
    sessionId: string;
    title?: string;
    isActive: boolean;
  }) => {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("sessionId", sessionId);
    formData.set("returnTo", location.pathname);
    formData.set("isActive", String(isActive));

    if (title !== undefined) {
      formData.set("title", title);
    }

    submit(formData, { method: "post", action: "/chat" });
  };

  const handleRenameSession = (
    event: React.MouseEvent<HTMLButtonElement>,
    sessionId: string,
    title: string,
    isActive: boolean
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const nextTitle = window.prompt("输入新的会话标题", formatSessionTitle(title));
    if (nextTitle === null) {
      return;
    }

    submitSessionAction({
      intent: "rename",
      sessionId,
      title: nextTitle,
      isActive,
    });
  };

  const handleDeleteSession = (
    event: React.MouseEvent<HTMLButtonElement>,
    sessionId: string,
    title: string,
    isActive: boolean
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(`删除会话“${formatSessionTitle(title)}”后将无法恢复，确认删除吗？`);
    if (!confirmed) {
      return;
    }

    submitSessionAction({
      intent: "delete",
      sessionId,
      isActive,
    });
  };

  return (
    <div className="chat-shell relative flex h-screen overflow-hidden bg-[var(--color-background)] text-[var(--chat-ink)]">

      {isMobile && isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close session list"
          className="absolute inset-0 z-40 bg-black/20"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        data-sidebar
        className={[
          "safe-top safe-bottom absolute inset-y-0 left-0 z-50 flex w-[260px] flex-col overflow-hidden bg-gray-50",
          "transition-all duration-200 ease-out lg:static lg:inset-auto lg:h-screen lg:translate-x-0",
          isMobile ? (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0",
        ].join(" ")}
      >
        <div className="border-b border-gray-200 px-4 pb-4 pt-5">
          <div className="relative flex items-center justify-between">
            <Link to="/chat" className="min-w-0" onClick={() => setIsMobileMenuOpen(false)}>
              <div className="pl-2 text-lg font-semibold text-[var(--chat-ink)]">
                OWU
              </div>
            </Link>
            {isMobile && (
              <button
                type="button"
                className="rounded-lg p-2 text-[var(--chat-muted)] hover:bg-gray-100"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <Link
            to="/chat"
            onClick={() => setIsMobileMenuOpen(false)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--chat-ink)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {sessions.length === 0 ? (
            <div className="mx-1 rounded-2xl border border-dashed border-gray-300 bg-gray-100/50 px-4 py-6 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--chat-muted)] shadow-sm">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.85 9.85 0 0 1-4.25-.95L3 20l1.4-3.72A8.94 8.94 0 0 1 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8Z" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--chat-ink)]">No chats yet</p>
              <p className="mt-1 text-xs leading-5 text-[var(--chat-muted)]">
                Start a thread and your recent sessions will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessionGroups.map((group) => (
                <section key={group.label}>
                  <div className="px-3 pb-1.5 text-xs font-medium text-[var(--chat-muted)]">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((session) => {
                      const isMenuOpen = openMenuSessionId === session.id;
                      const isCurrentSession = location.pathname === `/chat/${session.id}`;

                      return (
                        <div key={session.id} data-session-menu-root className="group/session relative">
                          <NavLink
                            to={`/chat/${session.id}`}
                            onClick={() => {
                              setOpenMenuSessionId(null);
                              setIsMobileMenuOpen(false);
                            }}
                            className={({ isActive }) =>
                              [
                                "group relative block rounded-lg px-3 py-2 pr-8 text-sm",
                                "transition-all duration-200",
                                isActive
                                  ? "bg-white shadow-sm text-[var(--chat-ink)] border border-gray-200"
                                  : "text-[var(--chat-muted)] hover:bg-gray-100/50 hover:text-[var(--chat-ink)]",
                              ].join(" ")
                            }
                          >
                            <div className="truncate">
                              {formatSessionTitle(session.title)}
                            </div>
                          </NavLink>

                          <button
                            type="button"
                            aria-label="Session options"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setOpenMenuSessionId((current) => current === session.id ? null : session.id);
                            }}
                            className={[
                              "absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded",
                              "text-[var(--chat-muted)] transition-opacity",
                              "hover:bg-gray-200 hover:text-[var(--chat-ink)]",
                              isMenuOpen
                                ? "bg-gray-200 text-[var(--chat-ink)] opacity-100"
                                : "opacity-0 group-hover/session:opacity-100",
                            ].join(" ")}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6h.01M12 12h.01M12 18h.01" />
                            </svg>
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-1 top-[calc(50%+0.75rem)] z-20 min-w-[140px] overflow-hidden rounded-md border border-[var(--chat-line)] bg-white p-1 shadow-lg animate-fade-in">
                              <button
                                type="button"
                                onClick={(event) => {
                                  setOpenMenuSessionId(null);
                                  handleRenameSession(event, session.id, session.title, isCurrentSession);
                                }}
                                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-gray-100"
                              >
                                <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 20h4l10.5-10.5a2.12 2.12 0 1 0-3-3L5 17v3Z" />
                                </svg>
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  setOpenMenuSessionId(null);
                                  handleDeleteSession(event, session.id, session.title, isCurrentSession);
                                }}
                                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-100/50 transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-sm font-semibold text-[var(--chat-ink)] shadow-sm">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--chat-ink)]">{user.username}</div>
              <div className="text-xs text-[var(--chat-muted)]">
                {user.role}
              </div>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="rounded-lg p-1.5 text-[var(--chat-muted)] transition-colors hover:bg-gray-200 hover:text-[var(--chat-ink)]"
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

      <main className="relative flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 items-center border-b border-[var(--chat-line)] px-4 lg:hidden">
            <button
              type="button"
              data-menu-button
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-lg p-2 text-[var(--chat-muted)] hover:bg-gray-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div className="ml-3 min-w-0">
              <div className="font-medium text-[var(--chat-ink)]">OWU</div>
            </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
