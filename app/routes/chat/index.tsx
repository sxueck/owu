import type { Route } from "./+types/index";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "新对话 - OWU" },
    { name: "description", content: "开始新的对话" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getAvailableModels } = await import("~/lib/server/chat.server");
  const { getUserSettings } = await import("~/lib/server/user-settings.server");

  const user = requireUser(session);
  const [models, settings] = await Promise.all([
    getAvailableModels(),
    getUserSettings(user.userId),
  ]);

  return { models, settings };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { createChatSession } = await import("~/lib/server/chat.server");
  const user = requireUser(session);

  const formData = await request.formData();
  const model = formData.get("model") as string;
  const prompt = formData.get("prompt") as string;
  const networkEnabled = formData.get("networkEnabled") as string;
  const thinkingEnabled = formData.get("thinkingEnabled") as string;

  if (!model || model.trim() === "") {
    return { error: "请选择模型" };
  }

  if (!prompt || prompt.trim() === "") {
    return { error: "请输入问题" };
  }

  const normalizedPrompt = prompt.trim();
  const sessionTitle = normalizedPrompt.length > 60 ? `${normalizedPrompt.slice(0, 57)}...` : normalizedPrompt;

  try {
    const chatSession = await createChatSession(user, {
      model: model.trim(),
      title: sessionTitle,
    });

    const params = new URLSearchParams();
    params.set("q", encodeURIComponent(normalizedPrompt));
    params.set("model", model.trim());
    if (networkEnabled === "true") {
      params.set("network", "1");
    }
    if (thinkingEnabled === "true") {
      params.set("thinking", "1");
    }

    return redirect(`/chat/${chatSession.id}?${params.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建会话失败";
    return { error: message };
  }
}

function createSubmissionKey(prompt: string, model: string): string | null {
  const content = prompt.trim();
  if (!content) {
    return null;
  }

  return JSON.stringify([content, model.trim()]);
}

export default function ChatIndexPage() {
  const { models, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // 优先使用服务端用户设置中的默认模型，支持失效回退
  const getInitialModel = () => {
    return settings.defaultModel?.selectedModelId ?? models[0]?.id ?? "";
  };

  const [selectedModel, setSelectedModel] = useState(getInitialModel);
  const [prompt, setPrompt] = useState("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [networkEnabled, setNetworkEnabled] = useState(settings.chatNetworkEnabled);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef<string | null>(null);
  const activeModel = models.find((model: { id: string }) => model.id === selectedModel) ?? models[0];

  // Persist network preference when toggled
  const handleNetworkToggle = useCallback(async (enabled: boolean) => {
    setNetworkEnabled(enabled);
    try {
      const response = await fetch("/api/preferences/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatNetworkEnabled: enabled }),
      });
      if (!response.ok) {
        console.warn("Failed to persist network preference");
      }
    } catch (err) {
      console.warn("Failed to persist network preference:", err);
    }
  }, []);

  useEffect(() => {
    if (navigation.state === "idle") {
      submitLockRef.current = null;
    }
  }, [navigation.state]);

  // Auto-focus textarea on page load
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modelMenuRef.current?.contains(target)) {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isModelMenuOpen]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    const key = createSubmissionKey(prompt, selectedModel);

    if (!key) {
      event.preventDefault();
      return;
    }

    if (submitLockRef.current === key) {
      event.preventDefault();
      return;
    }

    submitLockRef.current = key;
  }, [prompt, selectedModel]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
      <div className="relative mx-auto flex w-full max-w-[1320px] flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center py-6 sm:py-10 lg:py-14 xl:py-16">
          <div className="w-full max-w-[1180px]">
            {models.length === 0 ? (
                <div className="rounded-[24px] border border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.06)] p-6 text-center shadow-[0_24px_48px_rgba(15,23,42,0.06)]">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--chat-accent)] shadow-sm">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m0 3.75h.01M10.33 3.86 1.82 18a2.25 2.25 0 0 0 1.93 3.37h16.5A2.25 2.25 0 0 0 22.18 18L13.67 3.86a2.25 2.25 0 0 0-3.34 0Z" />
                    </svg>
                  </div>
                  <h2 className="mt-4 font-serif text-2xl text-[var(--chat-ink)]">暂无可用模型</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--chat-muted)]">
                    管理员需要至少配置一个模型后，才可以开始新的会话。
                  </p>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link
                      to="/admin"
                      className="rounded-full bg-[var(--chat-forest)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1b4fb9]"
                    >
                      前往管理后台
                    </Link>
                    <Link
                      to="/chat"
                      className="rounded-full border border-[var(--chat-line)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--chat-ink)] hover:bg-white/80"
                    >
                      留在当前页
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-[880px]">
                  <div className="text-center">
                    <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-[var(--chat-ink)] sm:text-[2.85rem]">
                      开始对话
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--chat-muted)] sm:text-[15px]">
                      提问题、做分析、审代码，或者整理思路
                    </p>
                  </div>

                  <Form method="post" className="mt-10" onSubmit={handleSubmit}>
                    <input type="hidden" name="model" value={selectedModel} />
                    <input type="hidden" name="networkEnabled" value={networkEnabled.toString()} />
                    <input type="hidden" name="thinkingEnabled" value={thinkingEnabled.toString()} />

                    {actionData?.error && (
                      <div className="mb-3 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {actionData.error}
                      </div>
                    )}

                    <div className="chat-input-shadow chat-input-shell rounded-[24px] border border-[var(--chat-line)] bg-white px-4 py-3">
                      <textarea
                        ref={textareaRef}
                        id="prompt"
                        name="prompt"
                        placeholder="尽管问，Enter 发送"
                        rows={1}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        className="chat-textarea min-h-[38px] max-h-[200px] w-full resize-none border-none bg-transparent px-0 py-2 text-[15px] leading-relaxed text-[var(--chat-ink)] outline-none placeholder:text-[var(--chat-muted)]/60"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            const form = event.currentTarget.form;
                            form?.requestSubmit();
                          }
                        }}
                        onInput={(event) => {
                          const target = event.target as HTMLTextAreaElement;
                          target.style.height = "auto";
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                      />

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleNetworkToggle(!networkEnabled)}
                            disabled={isSubmitting}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                              networkEnabled
                                ? "border-[var(--chat-accent)] bg-[rgba(199,103,58,0.1)] text-[var(--chat-accent)]"
                                : "border-[var(--chat-line)] bg-gray-50 text-[var(--chat-muted)] hover:border-gray-300"
                            }`}
                            title={networkEnabled ? "联网搜索已启用" : "联网搜索已禁用"}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            <span>{networkEnabled ? "Online" : "Offline"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setThinkingEnabled(!thinkingEnabled)}
                            disabled={isSubmitting}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                              thinkingEnabled
                                ? "border-purple-500 bg-purple-50 text-purple-600"
                                : "border-[var(--chat-line)] bg-gray-50 text-[var(--chat-muted)] hover:border-gray-300"
                            }`}
                            title={thinkingEnabled ? "思考模式已启用" : "思考模式已禁用"}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 0l-.707.707M12 21v-1M7.05 16.95l-.707.707M16.95 16.95l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                            </svg>
                            <span>{thinkingEnabled ? "Think" : "No Think"}</span>
                          </button>

                          <div ref={modelMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setIsModelMenuOpen((open) => !open)}
                              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--chat-muted)] transition-colors hover:bg-[rgba(20,33,28,0.04)] hover:text-[var(--chat-ink)]"
                              aria-haspopup="listbox"
                              aria-expanded={isModelMenuOpen}
                            >
                            <span className="max-w-[140px] truncate">{activeModel?.label ?? selectedModel}</span>
                            <svg
                              className={[
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isModelMenuOpen ? "rotate-180" : "rotate-0",
                              ].join(" ")}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {isModelMenuOpen ? (
                            <div className="absolute left-0 bottom-[calc(100%+0.5rem)] z-20 min-w-[220px] overflow-hidden rounded-xl border border-[var(--chat-line)] bg-white p-1.5 shadow-lg animate-fade-in-up">
                              <div className="space-y-0.5">
                                {models.map((model) => {
                                  const isActive = model.id === selectedModel;
                                  return (
                                    <button
                                      key={model.id}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive}
                                      onClick={() => {
                                        setSelectedModel(model.id);
                                        setIsModelMenuOpen(false);
                                      }}
                                      className={[
                                        "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm",
                                        "transition-colors",
                                        isActive
                                          ? "bg-[rgba(37,99,235,0.08)] text-[var(--chat-ink)]"
                                          : "text-[var(--chat-ink)] hover:bg-[rgba(20,33,28,0.04)]",
                                      ].join(" ")}
                                    >
                                      <span className="truncate pr-3">{model.label}</span>
                                      {isActive && (
                                        <svg className="h-4 w-4 text-[var(--chat-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 13 4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting || !prompt.trim()}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="发送"
                        >
                          {isSubmitting ? (
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Zm2 5.29A7.94 7.94 0 0 1 4 12H0c0 3.04 1.14 5.82 3 7.94l3-2.65Z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7v14" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </Form>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
