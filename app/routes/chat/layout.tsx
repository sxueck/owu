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

type MemorySource = 'manual' | 'ai_summary';

type Memory = {
  id: string;
  content: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
};

type UserSettings = {
  availableModels: Array<{ id: string; label: string; providerLabel: string }>;
  defaultModel: {
    selectedModelId: string;
    fallbackModelId: string | null;
    isFallback: boolean;
    invalidStoredModelId?: string | null;
  } | null;
  personalPrompt: {
    value: string;
    source: "default" | "custom";
    defaultValue: string;
  };
  memories: Memory[];
};

type SettingsTab = "general" | "prompt" | "memories";

const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  description: string;
}> = [
  {
    id: "general",
    label: "常规设置",
    description: "默认模型与使用偏好",
  },
  {
    id: "prompt",
    label: "个人提示词",
    description: "为每次对话增加稳定上下文",
  },
  {
    id: "memories",
    label: "长期记忆",
    description: "管理会长期保留的个人信息",
  },
];

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

  // User Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Settings form state
  const [defaultModelId, setDefaultModelId] = useState<string>("");
  const [personalPrompt, setPersonalPrompt] = useState<string>("");

  // Memory management state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryDraftContent, setMemoryDraftContent] = useState<string>("");
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  // Memory multi-select and summary generation state
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set());
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarySuccess, setSummarySuccess] = useState<string | null>(null);
  const hasMemories = memories.length > 0;

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

  // Fetch user settings when modal opens
  useEffect(() => {
    if (!isSettingsOpen) {
      // Clear memory selection and related states when modal closes
      clearMemorySelection();
      setSummaryError(null);
      setSummarySuccess(null);
      return;
    }

    setActiveSettingsTab("general");
    setIsLoadingSettings(true);
    setSettingsError(null);

    fetch("/api/user/settings")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to load settings" }));
          throw new Error(data.error || "Failed to load settings");
        }
        return res.json();
      })
      .then((data: UserSettings) => {
        setSettings(data);
        setMemories(data.memories);
        setDefaultModelId(data.defaultModel?.selectedModelId ?? "");
        setPersonalPrompt(data.personalPrompt?.value ?? "");
      })
      .catch((err) => {
        setSettingsError(err.message || "Failed to load settings");
      })
      .finally(() => {
        setIsLoadingSettings(false);
      });
  }, [isSettingsOpen]);

  // Handle ESC key for settings modal
  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !editingMemoryId) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen, editingMemoryId]);

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

  // User Settings handlers
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModelId: defaultModelId || null,
          personalPrompt: personalPrompt.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to save settings" }));
        throw new Error(data.error || "Failed to save settings");
      }

      setSettingsSuccess("设置已保存");
      setTimeout(() => setSettingsSuccess(null), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateMemory = async () => {
    if (!memoryDraftContent.trim()) return;

    setIsSavingMemory(true);
    setMemoryError(null);

    try {
      const res = await fetch("/api/user/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memoryDraftContent.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to create memory" }));
        throw new Error(data.error || "Failed to create memory");
      }

      const data = await res.json();
      setMemories((prev) => [data.memory, ...prev]);
      setMemoryDraftContent("");
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : "Failed to create memory");
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleUpdateMemory = async (memoryId: string) => {
    if (!memoryDraftContent.trim()) return;

    setIsSavingMemory(true);
    setMemoryError(null);

    try {
      const res = await fetch(`/api/user/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memoryDraftContent.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to update memory" }));
        throw new Error(data.error || "Failed to update memory");
      }

      const data = await res.json();
      setMemories((prev) =>
        prev.map((m) => (m.id === memoryId ? data.memory : m))
      );
      setEditingMemoryId(null);
      setMemoryDraftContent("");
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : "Failed to update memory");
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    setDeletingMemoryId(memoryId);
    setMemoryError(null);

    try {
      const res = await fetch(`/api/user/memories/${memoryId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to delete memory" }));
        throw new Error(data.error || "Failed to delete memory");
      }

      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : "Failed to delete memory");
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const startEditingMemory = (memory: Memory) => {
    // Clear selection when entering edit mode to avoid state conflicts
    clearMemorySelection();
    setEditingMemoryId(memory.id);
    setMemoryDraftContent(memory.content);
    setMemoryError(null);
    setSummaryError(null);
  };

  const cancelEditingMemory = () => {
    setEditingMemoryId(null);
    setMemoryDraftContent("");
    setMemoryError(null);
  };

  // Memory multi-select handlers
  const toggleMemorySelection = (memoryId: string) => {
    // Disable selection when editing a memory
    if (editingMemoryId) return;

    setSelectedMemoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(memoryId)) {
        next.delete(memoryId);
      } else {
        next.add(memoryId);
      }
      return next;
    });
  };

  const clearMemorySelection = () => {
    setSelectedMemoryIds(new Set());
  };

  const handleGenerateSummary = async () => {
    if (selectedMemoryIds.size === 0) return;

    setIsGeneratingSummary(true);
    setSummaryError(null);
    setSummarySuccess(null);

    try {
      const res = await fetch("/api/user/memories/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryIds: Array.from(selectedMemoryIds) }),
      });

      const data = await res.json().catch(() => ({ error: "Failed to generate summary" }));

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate summary");
      }

      // Insert new memory at the top of the list
      setMemories((prev) => [data.memory, ...prev]);
      clearMemorySelection();
      setSummarySuccess("记忆总结已生成并保存");
      setTimeout(() => setSummarySuccess(null), 3000);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const activeSettingsTabMeta = settingsTabs.find((tab) => tab.id === activeSettingsTab) ?? settingsTabs[0];

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

      {/* User Settings Modal */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-3 py-4 sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-settings-title"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="flex h-[min(760px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-panel)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--chat-line)] px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="user-settings-title" className="text-lg font-medium text-[var(--chat-ink)] sm:text-xl">
                    用户设置
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--chat-muted)]">
                    使用左侧导航切换不同设置页面，让模型、提示词与长期记忆分别独立管理。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-lg p-2 text-[var(--chat-muted)] transition hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)]"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <aside className="border-b border-[var(--chat-line)] bg-[var(--chat-sidebar-bg)] md:w-[232px] md:border-b-0 md:border-r md:border-[var(--chat-line)]">
                <div className="overflow-x-auto px-3 py-3 sm:px-4 md:overflow-visible md:px-3 md:py-4">
                  <div className="flex gap-2 md:flex-col">
                    {settingsTabs.map((tab) => {
                      const isActive = activeSettingsTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveSettingsTab(tab.id)}
                          className={[
                            "group min-w-[180px] rounded-xl px-3 py-2.5 text-left transition md:min-w-0",
                            isActive
                              ? "bg-[var(--chat-panel)] text-[var(--chat-ink)]"
                              : "text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)]",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">{tab.label}</span>
                            {tab.id === "memories" && (
                              <span className={[
                                "rounded-full border px-2 py-0.5 text-xs font-medium",
                                isActive
                                  ? "border-[var(--chat-line)] bg-[var(--chat-background)] text-[var(--chat-ink)]"
                                  : "border-[var(--chat-line)] text-[var(--chat-muted)]",
                              ].join(" ")}>
                                {memories.length}
                              </span>
                            )}
                          </div>
                          <p className={[
                            "mt-1 text-xs leading-5",
                            "text-[var(--chat-muted)]",
                          ].join(" ")}>
                            {tab.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-[var(--chat-line)] px-5 py-3 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--chat-muted)]">当前页面</p>
                      <h3 className="mt-1.5 text-base font-medium text-[var(--chat-ink)]">{activeSettingsTabMeta.label}</h3>
                      <p className="mt-1 text-sm leading-5 text-[var(--chat-muted)]">{activeSettingsTabMeta.description}</p>
                    </div>
                    {activeSettingsTab === "memories" ? (
                      <div className="rounded-xl border border-[var(--chat-line)] bg-[var(--chat-background)] px-3 py-1.5 text-right text-xs text-[var(--chat-muted)]">
                        <div className="text-sm font-medium text-[var(--chat-ink)]">{memories.length} 条记忆</div>
                        <div className="mt-1">新增、编辑与删除会立即生效</div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[var(--chat-line)] bg-[var(--chat-background)] px-3 py-1.5 text-right text-xs text-[var(--chat-muted)]">
                        <div className="text-sm font-medium text-[var(--chat-ink)]">可手动保存</div>
                        <div className="mt-1">切换页面不会自动提交修改</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                  {isLoadingSettings ? (
                    <div className="flex h-full min-h-[420px] items-center justify-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--chat-line)] border-t-[var(--chat-accent)]" />
                    </div>
                  ) : settingsError && !settings ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {settingsError}
                    </div>
                  ) : (
                    <div className="flex min-h-[420px] flex-col">
                      {activeSettingsTab === "general" && (
                        <section className="flex min-h-full flex-col gap-4">
                          <div className="rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-background)] p-4">
                            <div className="max-w-2xl">
                              <h4 className="text-sm font-medium text-[var(--chat-ink)]">默认模型</h4>
                              <p className="mt-1.5 text-sm leading-5 text-[var(--chat-muted)]">
                                为新对话预设常用模型，减少每次切换模型的操作成本。
                              </p>
                            </div>
                            <div className="mt-4 space-y-2.5">
                              <select
                                value={defaultModelId}
                                onChange={(e) => setDefaultModelId(e.target.value)}
                                className="w-full rounded-xl border border-[var(--chat-line)] bg-[var(--chat-panel)] px-3 py-2.5 text-sm text-[var(--chat-ink)] outline-none transition focus:border-[var(--chat-accent)]"
                              >
                                {settings?.availableModels.length === 0 ? (
                                  <option value="">暂无可用模型</option>
                                ) : (
                                  settings?.availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.label} ({model.providerLabel})
                                    </option>
                                  ))
                                )}
                              </select>
                              {settings?.defaultModel?.isFallback && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-700">
                                  原默认模型（{settings.defaultModel.invalidStoredModelId}）已不可用，系统已自动回退到当前可用模型。
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      )}

                      {activeSettingsTab === "prompt" && (
                        <section className="flex min-h-full flex-col gap-4">
                          <div className="rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-background)] p-4">
                            <div className="max-w-2xl">
                              <h4 className="text-sm font-medium text-[var(--chat-ink)]">个人提示词</h4>
                              <p className="mt-1.5 text-sm leading-5 text-[var(--chat-muted)]">
                                定义你希望模型长期遵循的表达风格、背景信息或固定约束。
                              </p>
                            </div>
                            <div className="mt-4 space-y-2.5">
                              <textarea
                                value={personalPrompt}
                                onChange={(e) => setPersonalPrompt(e.target.value)}
                                rows={10}
                                placeholder={settings?.personalPrompt?.defaultValue || "输入你的个人提示词..."}
                                className="w-full min-h-[220px] resize-none rounded-xl border border-[var(--chat-line)] bg-[var(--chat-panel)] px-3 py-2.5 text-sm leading-5 text-[var(--chat-ink)] outline-none transition focus:border-[var(--chat-accent)]"
                              />
                              <div className="rounded-xl border border-[var(--chat-line)] bg-[var(--chat-panel)] px-3 py-2.5 text-sm leading-5 text-[var(--chat-muted)]">
                                {settings?.personalPrompt?.source === "default"
                                  ? "当前使用默认提示词，保存后会覆盖为你的自定义版本。"
                                  : "当前使用自定义提示词，清空后保存即可恢复默认提示词。"}
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      {activeSettingsTab === "memories" && (
                        <section className="flex min-h-full flex-col gap-3.5">
                          {!editingMemoryId && (
                            <div className="rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-background)] p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h4 className="text-sm font-medium text-[var(--chat-ink)]">新增记忆</h4>
                                  <p className="mt-1.5 text-sm leading-5 text-[var(--chat-muted)]">
                                    适合保存身份背景、偏好习惯、项目上下文等会反复使用的信息。
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4">
                                <textarea
                                  value={memoryDraftContent}
                                  onChange={(e) => setMemoryDraftContent(e.target.value)}
                                  rows={4}
                                  placeholder="例如：我偏好先给结论，再给步骤；代码示例优先 TypeScript。"
                                  className="w-full resize-none rounded-xl border border-[var(--chat-line)] bg-[var(--chat-panel)] px-3 py-2.5 text-sm leading-5 text-[var(--chat-ink)] outline-none transition focus:border-[var(--chat-accent)]"
                                />
                                <div className="mt-2.5 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={handleCreateMemory}
                                    disabled={!memoryDraftContent.trim() || isSavingMemory}
                                    className="rounded-xl bg-[var(--chat-accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isSavingMemory ? "保存中..." : "添加记忆"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--chat-line)] bg-[var(--chat-background)] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-medium text-[var(--chat-ink)]">记忆列表</h4>
                                <p className="mt-1 text-sm leading-5 text-[var(--chat-muted)]">编辑单条信息，让系统在后续对话中更贴近你的习惯。</p>
                              </div>
                              <span className="rounded-full border border-[var(--chat-line)] px-3 py-1 text-xs text-[var(--chat-muted)]">
                                {memories.length} 条
                              </span>
                            </div>

                            {/* Summary Generation Action Area */}
                            {!editingMemoryId && (
                              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-800 dark:bg-indigo-900/20">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-300">
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                    </svg>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                                      生成记忆总结
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-indigo-700 dark:text-indigo-300">
                                      {!hasMemories ? (
                                        <>当前还没有可供选择的记忆。先在上方添加一条后，列表会显示在下方，每条左侧都有勾选框。</>
                                      ) : selectedMemoryIds.size > 0 ? (
                                        <>已选择 {selectedMemoryIds.size} 条记忆。点击生成后，所选内容将被发送给模型分析，并创建一条新的 AI 总结记忆。</>
                                      ) : (
                                        <>在下方记忆列表中勾选需要汇总的内容，然后点击生成，让 AI 基于所选内容创建一条总结。</>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={clearMemorySelection}
                                    disabled={selectedMemoryIds.size === 0 || isGeneratingSummary}
                                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-800/30"
                                  >
                                    取消选择
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleGenerateSummary}
                                    disabled={selectedMemoryIds.size === 0 || isGeneratingSummary}
                                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isGeneratingSummary ? (
                                      <span className="flex items-center gap-1.5">
                                        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        生成中...
                                      </span>
                                    ) : (
                                      hasMemories ? "生成总结" : "暂无可选记忆"
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Summary Error */}
                            {summaryError && (
                              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {summaryError}
                              </div>
                            )}

                            {/* Summary Success */}
                            {summarySuccess && (
                              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                {summarySuccess}
                              </div>
                            )}

                            <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                              {memories.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-[var(--chat-line)] px-4 py-8 text-center text-sm text-[var(--chat-muted)]">
                                  暂无记忆，可以先在上方添加第一条。添加后，这里会出现可选择的记忆列表，每条左侧都可以勾选。
                                </p>
                              ) : (
                              memories.map((memory) => (
                                  <div
                                    key={memory.id}
                                    className={[
                                      "rounded-xl border bg-[var(--chat-panel)] p-3.5 transition",
                                      selectedMemoryIds.has(memory.id) && !editingMemoryId
                                        ? "border-indigo-300 bg-indigo-50/30 dark:border-indigo-700 dark:bg-indigo-900/10"
                                        : "border-[var(--chat-line)]",
                                    ].join(" ")}
                                  >
                                    {editingMemoryId === memory.id ? (
                                      <div className="space-y-3">
                                        <textarea
                                          value={memoryDraftContent}
                                          onChange={(e) => setMemoryDraftContent(e.target.value)}
                                          rows={4}
                                          className="w-full resize-none rounded-xl border border-[var(--chat-line)] bg-[var(--chat-background)] px-3 py-2.5 text-sm leading-5 text-[var(--chat-ink)] outline-none transition focus:border-[var(--chat-accent)]"
                                        />
                                        <div className="flex justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={cancelEditingMemory}
                                            className="rounded-xl border border-[var(--chat-line)] px-4 py-2 text-sm text-[var(--chat-ink)] transition hover:bg-[var(--chat-hover-bg)]"
                                          >
                                            取消
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateMemory(memory.id)}
                                            disabled={!memoryDraftContent.trim() || isSavingMemory}
                                            className="rounded-xl bg-[var(--chat-accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {isSavingMemory ? "保存中..." : "保存"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="flex items-start gap-3">
                                          {/* Selection Checkbox */}
                                          {!editingMemoryId && (
                                            <button
                                              type="button"
                                              onClick={() => toggleMemorySelection(memory.id)}
                                              disabled={isGeneratingSummary}
                                              className={[
                                                "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition",
                                                selectedMemoryIds.has(memory.id)
                                                  ? "border-indigo-500 bg-indigo-500 text-white"
                                                  : "border-[var(--chat-line)] bg-[var(--chat-background)] hover:border-indigo-400",
                                                isGeneratingSummary && "cursor-not-allowed opacity-50",
                                              ].join(" ")}
                                            >
                                              {selectedMemoryIds.has(memory.id) && (
                                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                              )}
                                            </button>
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="whitespace-pre-wrap text-sm leading-5 text-[var(--chat-ink)]">
                                              {memory.content}
                                            </p>
                                            <div className="mt-2.5 flex items-center justify-between gap-3">
                                              <div className="flex items-center gap-2">
                                                {/* Source Badge */}
                                                <span className={[
                                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                                  memory.source === 'ai_summary'
                                                    ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
                                                    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
                                                ].join(" ")}>
                                                  {memory.source === 'ai_summary' ? (
                                                    <>
                                                      <svg className="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                                      </svg>
                                                      AI 总结
                                                    </>
                                                  ) : (
                                                    <>
                                                      <svg className="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                                      </svg>
                                                      手动添加
                                                    </>
                                                  )}
                                                </span>
                                                <span className="text-xs text-[var(--chat-muted)]">
                                                  {new Date(memory.updatedAt).toLocaleString("zh-CN")}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => startEditingMemory(memory)}
                                                  disabled={isGeneratingSummary || selectedMemoryIds.size > 0}
                                                  className="rounded-lg p-2 text-[var(--chat-muted)] transition hover:bg-[var(--chat-hover-bg)] hover:text-[var(--chat-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                  </svg>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteMemory(memory.id)}
                                                  disabled={deletingMemoryId === memory.id || isGeneratingSummary || selectedMemoryIds.size > 0}
                                                  className="rounded-lg p-2 text-[var(--chat-muted)] transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {deletingMemoryId === memory.id ? (
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--chat-line)] border-t-red-600" />
                                                  ) : (
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0M5.25 6h13.5M10.5 6V4.5a2.25 2.25 0 012.25-2.25h.75a2.25 2.25 0 012.25 2.25V6" />
                                                    </svg>
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {memoryError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                              {memoryError}
                            </div>
                          )}
                        </section>
                      )}

                      {settingsError && settings && (
                        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {settingsError}
                        </div>
                      )}
                      {settingsSuccess && (
                        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                          {settingsSuccess}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--chat-line)] bg-[var(--chat-panel)] px-5 py-4 sm:px-6">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(false)}
                      className="rounded-xl border border-[var(--chat-line)] px-4 py-2 text-sm text-[var(--chat-ink)] transition hover:bg-[var(--chat-hover-bg)]"
                    >
                      关闭
                    </button>
                    {activeSettingsTab !== "memories" && (
                      <button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={isSavingSettings || isLoadingSettings}
                        className="rounded-xl bg-[var(--chat-accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingSettings ? "保存中..." : "保存设置"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsUserMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--chat-ink)] hover:bg-[var(--chat-hover-bg)] transition-colors"
                >
                  <svg className="h-4 w-4 text-[var(--chat-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span>用户设置</span>
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
