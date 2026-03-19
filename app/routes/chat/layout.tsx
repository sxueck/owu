import type { Route } from "./+types/layout";
import { Form, Link, NavLink, Outlet, redirect, useLoaderData, useLocation, useSubmit } from "react-router";
import { getSession } from "~/sessions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "~/components/ThemeProvider";

type DeleteModalState = {
  sessionId: string;
  title: string;
  isActive: boolean;
};

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
  const { getUserBookmarks } = await import("~/lib/server/bookmark.server");

  const user = requireUser(session);
  const [sessions, bookmarks] = await Promise.all([
    getUserChatSessions(user),
    getUserBookmarks(user),
  ]);
  const version = process.env.APP_VERSION ?? "dev";
  const buildTime = process.env.APP_BUILD_TIME ?? new Date().toISOString();

  return { user, sessions, bookmarks, version, buildTime };
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
  const { user, sessions, bookmarks, version, buildTime } = useLoaderData<typeof loader>();
  const location = useLocation();
  const submit = useSubmit();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<DeleteModalState | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!deleteModalState) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteModalState(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [deleteModalState]);

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

    setDeleteModalState({ sessionId, title, isActive });
  };

  const confirmDeleteSession = () => {
    if (!deleteModalState) {
      return;
    }

    submitSessionAction({
      intent: "delete",
      sessionId: deleteModalState.sessionId,
      isActive: deleteModalState.isActive,
    });
    setDeleteModalState(null);
  };

  return (
    <div className="chat-shell relative flex h-screen overflow-hidden bg-[var(--color-background)] text-[var(--chat-ink)]">

      {deleteModalState && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/35 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
          onClick={() => setDeleteModalState(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-panel)] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-session-title" className="text-base font-semibold text-[var(--chat-ink)]">
              删除会话
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--chat-muted)]">
              确认删除会话“{formatSessionTitle(deleteModalState.title)}”吗？删除后将无法恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalState(null)}
                className="rounded-lg border border-[var(--chat-line)] px-4 py-2 text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteSession}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

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
          "safe-top safe-bottom absolute inset-y-0 left-0 z-50 flex w-[260px] flex-col overflow-hidden bg-[var(--chat-sidebar-bg)]",
          "transition-all duration-200 ease-out lg:static lg:inset-auto lg:h-screen lg:translate-x-0",
          isMobile ? (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0",
        ].join(" ")}
      >
        <div className="border-b border-[var(--chat-sidebar-border)] px-4 pb-4 pt-5">
          <div className="relative flex items-center justify-between">
            <Link to="/chat" className="min-w-0" onClick={() => setIsMobileMenuOpen(false)}>
              <div className="pl-2 text-lg font-semibold text-[var(--chat-ink)]">
                OWU
              </div>
            </Link>
            {isMobile && (
              <button
                type="button"
                className="rounded-lg p-2 text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <NavLink
              to="/chat/notion-space"
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => [
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-[var(--chat-line-strong)] bg-[var(--chat-panel)] text-[var(--chat-ink)]"
                  : "border-[var(--chat-line)] bg-[var(--chat-panel)] text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)]",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--chat-hover-bg)] text-[var(--chat-muted)]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h8M8 11h8M8 15h5" />
                  </svg>
                </span>
                <span>
                  <span className="block font-medium">Notion 空间</span>
                  <span className="block text-xs text-[var(--chat-muted)]">管理收藏的代码块</span>
                </span>
              </span>
              <span className="rounded-full border border-[var(--chat-line)] px-2 py-0.5 text-xs text-[var(--chat-muted)]">
                {bookmarks.length}
              </span>
            </NavLink>

            <NavLink
              to="/chat"
              end
              onClick={() => setIsMobileMenuOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] px-3 py-2 text-sm font-medium text-[var(--chat-ink)] transition-colors hover:bg-[var(--chat-hover-bg)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </NavLink>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {sessions.length === 0 ? (
            <div className="mx-1 rounded-2xl border border-dashed border-[var(--chat-line)] bg-[var(--chat-hover-bg)] px-4 py-6 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--chat-panel)] text-[var(--chat-muted)] shadow-sm border border-[var(--chat-line)]">
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
                  <div className="mt-2 px-3 pb-1.5 text-xs font-medium text-[var(--chat-muted)]">
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
                                  ? "bg-[var(--chat-panel)] text-[var(--chat-ink)] border border-[var(--chat-line)]"
                                  : "text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
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
                              "hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]",
                              isMenuOpen
                                ? "bg-[var(--chat-hover-bg)] text-[var(--chat-ink)] opacity-100"
                                : "opacity-0 group-hover/session:opacity-100",
                            ].join(" ")}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6h.01M12 12h.01M12 18h.01" />
                            </svg>
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-1 top-[calc(50%+0.75rem)] z-20 min-w-[140px] overflow-hidden rounded-md border border-[var(--chat-line)] bg-[var(--chat-panel)] p-1 shadow-lg animate-fade-in">
                              <button
                                type="button"
                                onClick={(event) => {
                                  setOpenMenuSessionId(null);
                                  handleRenameSession(event, session.id, session.title, isCurrentSession);
                                }}
                                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)]"
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

        <div className="border-t border-[var(--chat-sidebar-border)] px-3 py-3">
          <div
            ref={userMenuRef}
            className="relative"
          >
            <div
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--chat-hover-bg)] transition-colors cursor-pointer"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-panel)] border border-[var(--chat-line)] text-sm font-semibold text-[var(--chat-ink)]">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--chat-ink)]">{user.username}</div>
                <div className="text-xs text-[var(--chat-muted)]">
                  {user.role}
                </div>
              </div>
              <svg
                className={[
                  "h-4 w-4 text-[var(--chat-muted)] transition-transform duration-200",
                  isUserMenuOpen ? "rotate-180" : "rotate-0",
                ].join(" ")}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m6 9 6 6 6-6" />
              </svg>
            </div>

            {isUserMenuOpen && (
              <div className="absolute left-0 bottom-[calc(100%+0.25rem)] z-20 w-full overflow-hidden rounded-lg border border-[var(--chat-line)] bg-[var(--chat-panel)] p-1 shadow-lg animate-fade-in-up">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setIsUserMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)] transition-colors"
                >
                  {theme === "dark" ? (
                    <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>
                  )}
                  <span>{theme === "dark" ? "浅色主题" : "深色主题"}</span>
                </button>

                {user.role === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)] transition-colors"
                  >
                    <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>管理员设置</span>
                  </Link>
                )}

                <Form method="post" action="/logout" className="w-full">
                  <button
                    type="submit"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)] transition-colors"
                  >
                    <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
                    </svg>
                    <span>登出</span>
                  </button>
                </Form>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--chat-background)]">
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 items-center border-b border-[var(--chat-line)] px-4 lg:hidden">
            <button
              type="button"
              data-menu-button
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-lg p-2 text-[var(--chat-muted)] hover:bg-[var(--chat-hover-bg)]"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div className="ml-3 min-w-0">
              <div className="font-medium text-[var(--chat-ink)]">OWU</div>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
          <footer className="px-4 py-2 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-center gap-2 text-[11px] text-[var(--chat-muted)]">
              <span>v{version}</span>
              <span>·</span>
              <span>{new Date(buildTime).toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              })} 构建</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
