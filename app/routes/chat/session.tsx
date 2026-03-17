import type { Route } from "./+types/session";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { getSession } from "~/sessions";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Copied</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

interface ChatModelOption {
  id: string;
  model: string;
  providerId: string;
  providerLabel: string;
  label: string;
}

type SSEEvent =
  | { type: "start"; sessionId: string; model: string }
  | { type: "token"; content: string }
  | { type: "complete"; messageId: string; content: string }
  | { type: "error"; message: string };

export function meta({ data }: Route.MetaArgs) {
  const session = data?.session;
  return [
    { title: `${session?.title || "Chat"} - OWU` },
    { name: "description", content: "Chat conversation" },
  ];
}

interface LoaderData {
  models: ChatModelOption[];
  session: {
    id: string;
    title: string;
    model: string;
    modelName: string;
    modelLabel: string;
    providerLabel: string | null;
    createdAt: Date;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    model: string | null;
    modelLabel: string | null;
    content: string;
    createdAt: Date;
  }>;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getAvailableModels, getChatMessages, getChatSessionMeta } = await import("~/lib/server/index.server");
  const user = requireUser(cookieSession);

  const sessionId = params.sessionId;
  if (!sessionId) {
    throw new Response("Session ID required", { status: 400 });
  }

  try {
    const models = await getAvailableModels();
    const messages = await getChatMessages(sessionId, user);
    const session = await getChatSessionMeta(sessionId, user);

    return { models, session, messages };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Failed to load chat session", { status: 500 });
  }
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 leading-7 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-bold text-[var(--chat-ink)]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-bold text-[var(--chat-ink)]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-4 text-lg font-semibold text-[var(--chat-ink)]">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-[var(--chat-ink)]">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 mt-3 text-sm font-semibold text-[var(--chat-ink)]">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--chat-muted)]">{children}</h6>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 leading-7">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 leading-7">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !className;
            
            if (isInline) {
              return (
                <code className="rounded-md bg-[rgba(20,33,28,0.08)] px-1.5 py-0.5 font-mono text-[0.9em] transition-colors duration-150 hover:bg-[rgba(20,33,28,0.12)]" {...props}>
                  {children}
                </code>
              );
            }
            
            const language = match ? match[1] : "";
            const codeString = String(children).replace(/\n$/, "");
            
            return (
              <div className="my-4 overflow-hidden rounded-2xl border border-[rgba(20,33,28,0.15)] bg-[#1a2822] shadow-lg transition-all duration-200 hover:shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 bg-[#14211c] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {language && (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--chat-accent)]">
                        {language}
                      </span>
                    )}
                  </div>
                  <CopyButton text={codeString} />
                </div>
                <div className="relative">
                  <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-white/90">
                    <code className={`${className} font-mono`} {...props}>{children}</code>
                  </pre>
                </div>
              </div>
            );
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-[var(--chat-accent)] pl-4 italic text-[var(--chat-muted)]">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-[var(--chat-accent)] underline hover:no-underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-[var(--chat-line)]" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[rgba(20,33,28,0.06)]">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-[var(--chat-line)] last:border-b-0">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-[var(--chat-ink)]">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-[var(--chat-ink)]">{children}</td>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--chat-ink)]">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through text-[var(--chat-muted)]">{children}</del>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MessageCard({
  role,
  content,
  createdAt,
  pending,
  assistantLabel,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: Date;
  pending?: boolean;
  assistantLabel?: string;
}) {
  const isUser = role === "user";
  const label = isUser ? "You" : role === "assistant" ? assistantLabel || "Assistant" : "System";

  return (
    <article
      className={[
        "animate-slide-up group px-2 py-3 sm:px-3 sm:py-4 transition-all duration-300",
        isUser
          ? "ml-auto max-w-[92%]"
          : "max-w-[95%]",
        pending ? "opacity-95" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="text-sm font-medium text-[var(--chat-ink)]">{label}</div>
        {pending ? (
          <span className="text-xs text-[var(--chat-muted)]">
            Streaming
          </span>
        ) : createdAt ? (
          <span className="text-xs text-[var(--chat-muted)] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {formatTime(createdAt)}
          </span>
        ) : null}
      </div>
      <div className="text-[15px] text-[var(--chat-ink)]">
        <MessageContent content={content} />
        {pending && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-[var(--chat-accent)] align-middle" />}
      </div>
    </article>
  );
}

export default function ChatSessionPage() {
  const { models, session, messages: initialMessages } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(initialMessages);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(session.model);
  const [activeAssistantLabel, setActiveAssistantLabel] = useState(session.modelLabel);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const hasAutoSubmittedRef = useRef(false);

  const activeModel = models.find((model) => model.id === selectedModel) ?? models[0];

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setSelectedModel(session.model);
    setActiveAssistantLabel(session.modelLabel);
  }, [session.model, session.modelLabel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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

  const submitPrompt = useCallback(
    async (rawContent: string, model = selectedModel) => {
      const content = rawContent.trim();
      if (!content) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");

      if (formRef.current) {
        formRef.current.reset();
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        const selectedOption = models.find((item) => item.id === model) ?? activeModel;
        setActiveAssistantLabel(selectedOption?.label ?? session.modelLabel);

        const optimisticUserMessage: LoaderData["messages"][number] = {
          id: `temp-${Date.now()}`,
          role: "user" as const,
          model: null,
          modelLabel: null,
          content: content.trim(),
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, optimisticUserMessage]);

        const response = await fetch(`/chat/${session.id}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, model }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to send message");
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";
        let streamCompleted = false;
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent: { type: string; data: string } | null = null;

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = { type: line.slice(7), data: "" };
            } else if (line.startsWith("data: ") && currentEvent) {
              currentEvent.data = line.slice(6);

              try {
                const eventData = JSON.parse(currentEvent.data) as SSEEvent;

                switch (eventData.type) {
                  case "start":
                    setActiveAssistantLabel(selectedOption?.label ?? eventData.model);
                    break;
                  case "token":
                    assistantContent += eventData.content;
                    setStreamingContent(assistantContent);
                    break;
                  case "complete":
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: eventData.messageId,
                        role: "assistant",
                        model,
                        modelLabel: selectedOption?.label ?? session.modelLabel,
                        content: eventData.content,
                        createdAt: new Date(),
                      },
                    ]);
                    setStreamingContent("");
                    setIsStreaming(false);
                    streamCompleted = true;
                    break;
                  case "error":
                    streamError = eventData.message;
                    setError(eventData.message);
                    setIsStreaming(false);
                    break;
                }
              } catch (parseError) {
                console.error("Failed to parse SSE event:", parseError);
              }

              currentEvent = null;
            } else if (line === "" && currentEvent) {
              currentEvent = null;
            }
          }
        }

        if (streamCompleted && !streamError) {
          window.location.reload();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send message";
        setError(message);
        setIsStreaming(false);
      }
    },
    [activeModel, models, selectedModel, session.id, session.modelLabel],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const formData = new FormData(e.currentTarget);
      const content = formData.get("content") as string;

      await submitPrompt(content, selectedModel);
    },
    [selectedModel, submitPrompt],
  );

  useEffect(() => {
    // 从 URL 查询参数中读取初始 prompt
    const searchParams = new URLSearchParams(location.search);
    const encodedPrompt = searchParams.get("q");
    const initialPrompt = encodedPrompt ? decodeURIComponent(encodedPrompt) : null;
    const initialModel = searchParams.get("model");

    if (
      hasAutoSubmittedRef.current ||
      typeof initialPrompt !== "string" ||
      initialPrompt.trim() === "" ||
      messages.length > 0
    ) {
      return;
    }

    hasAutoSubmittedRef.current = true;
    void submitPrompt(initialPrompt, typeof initialModel === "string" ? initialModel : selectedModel);
    // 清除 URL 参数，避免刷新时重复发送
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, messages.length, navigate, selectedModel, submitPrompt]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {messages.length === 0 && !isStreaming ? (
            <div className="chat-panel-strong rounded-[30px] px-6 py-10 text-center sm:px-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-forest-soft)] text-[var(--chat-forest)]">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.85 9.85 0 0 1-4.25-.95L3 20l1.4-3.72A8.94 8.94 0 0 1 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8Z" />
                </svg>
              </div>
              <h2 className="mt-5 text-xl font-medium text-[var(--chat-ink)]">
                This session is ready.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--chat-muted)] sm:text-base">
                Send the first prompt to start building the thread. The layout stays intentionally quiet so the conversation becomes the focal point.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageCard
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                  assistantLabel={message.modelLabel ?? activeAssistantLabel}
                />
              ))}

              {isStreaming && (
                <MessageCard
                  role="assistant"
                  content={streamingContent || "..."}
                  pending
                  assistantLabel={activeAssistantLabel}
                />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="safe-bottom px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-4xl">
          {error && (
            <div className="mb-4 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="chat-input-shadow chat-input-shell rounded-2xl border border-[var(--chat-line)] bg-white p-3 sm:p-4"
          >
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <textarea
                  ref={textareaRef}
                  name="content"
                  placeholder={
                    isStreaming
                      ? `${activeAssistantLabel} is responding...`
                      : `Ask ${activeAssistantLabel} to plan, review, explain, or draft...`
                  }
                  required
                  rows={1}
                  disabled={isStreaming}
                  className="chat-textarea max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-2 py-2 text-[15px] text-[var(--chat-ink)] outline-none placeholder:text-[var(--chat-muted)]/70"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${Math.min(target.scrollHeight, 220)}px`;
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isStreaming}
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-all duration-200 ease-out hover:bg-[#b95b30] hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
                aria-label="Send message"
              >
                {isStreaming ? (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Zm2 5.29A7.94 7.94 0 0 1 4 12H0c0 3.04 1.14 5.82 3 7.94l3-2.65Z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 3 10 14m0 0-4-4m4 4v7l11-18Z" />
                  </svg>
                )}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-[var(--chat-line)] px-2 pt-3 text-xs text-[var(--chat-muted)] sm:flex-row sm:items-center sm:justify-between">
              <span>Enter to send, Shift + Enter for a new line.</span>
              <div ref={modelMenuRef} className="relative self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-gray-50 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--chat-ink)] transition-all duration-200 ease-out hover:bg-white hover:border-gray-300 active:scale-95"
                  aria-haspopup="listbox"
                  aria-expanded={isModelMenuOpen}
                >
                  <span className="max-w-[220px] truncate normal-case tracking-normal text-[12px] font-medium text-[var(--chat-ink)]">
                    {activeModel?.label ?? session.modelLabel}
                  </span>
                  <svg
                    className={[
                      "h-4 w-4 text-[var(--chat-muted)] transition-transform duration-200",
                      isModelMenuOpen ? "rotate-180" : "rotate-0",
                    ].join(" ")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isModelMenuOpen && (
                  <div className="absolute bottom-[calc(100%+0.75rem)] right-0 z-20 min-w-[280px] overflow-hidden rounded-xl border border-[var(--chat-line)] bg-white p-2 shadow-lg animate-fade-in-up">
                    <div className="space-y-1">
                      {models.map((model, index) => {
                        const isActive = model.id === selectedModel;

                        return (
                          <button
                            key={model.id}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setActiveAssistantLabel(model.label);
                              setIsModelMenuOpen(false);
                            }}
                            className={[
                              "flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm",
                              "transition-all duration-200 ease-out",
                              "hover:translate-x-0.5",
                              isActive
                                ? "bg-[rgba(199,103,58,0.12)] text-[var(--chat-ink)]"
                                : "text-[var(--chat-ink)] hover:bg-white/80",
                            ].join(" ")}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <span className="truncate pr-4">{model.label}</span>
                            {isActive && (
                              <span className="rounded-full bg-[var(--chat-accent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white animate-fade-in">
                                Active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
