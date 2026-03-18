import type { Route } from "./+types/session";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { getSession } from "~/sessions";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchEventSource } from "@microsoft/fetch-event-source";

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

/**
 * SSE event types for streaming chat
 *
 * Event sequence contract:
 * start -> zero or more (reasoning | token) -> complete -> zero or one suggestions
 * notice can appear at any point for non-fatal warnings/info
 * error can terminate at any point on failure paths
 */
type SSEEvent =
  | { type: "start"; sessionId: string; model: string }
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "complete"; messageId: string; content: string }
  | { type: "suggestions"; messageId: string; questions: string[] }
  | { type: "notice"; level: "info" | "warning"; message: string }
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
    reasoning?: string | null;
    followUpQuestions?: string[] | null;
    createdAt: Date;
  }>;
  preferences: {
    chatNetworkEnabled: boolean;
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getAvailableModels, getChatMessages, getChatSessionMeta, getUserChatPreferences } = await import("~/lib/server/index.server");
  const user = requireUser(cookieSession);

  const sessionId = params.sessionId;
  if (!sessionId) {
    throw new Response("Session ID required", { status: 400 });
  }

  try {
    const [models, messages, session, preferences] = await Promise.all([
      getAvailableModels(),
      getChatMessages(sessionId, user),
      getChatSessionMeta(sessionId, user),
      getUserChatPreferences(user.userId),
    ]);

    return { models, session, messages, preferences };
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
          h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-semibold text-[var(--chat-ink)]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-semibold text-[var(--chat-ink)]">{children}</h2>,
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
                <code className="rounded-md bg-[rgba(20,33,28,0.08)] px-1.5 py-0.5 text-[0.9em] transition-colors duration-150 hover:bg-[rgba(20,33,28,0.12)]" style={{ fontFamily: 'var(--font-mono)' }} {...props}>
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
                  <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-white/90" style={{ fontFamily: 'var(--font-mono)' }}>
                    <code className={className} style={{ fontFamily: 'var(--font-mono)' }} {...props}>{children}</code>
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
          strong: ({ children }) => <strong className="font-bold text-[var(--chat-ink)]">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through text-[var(--chat-muted)]">{children}</del>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ReasoningPanel({ reasoning }: { reasoning: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-3 mb-3 rounded-lg border border-[var(--chat-line)] bg-[rgba(20,33,28,0.03)] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[var(--chat-muted)] hover:text-[var(--chat-ink)] hover:bg-[rgba(20,33,28,0.05)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          思考过程
        </span>
        <svg
          className={["h-4 w-4 transition-transform duration-200", isExpanded ? "rotate-180" : ""].join(" ")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 text-xs text-[var(--chat-muted)] border-t border-[var(--chat-line)] bg-[rgba(20,33,28,0.02)]">
          <pre className="whitespace-pre-wrap leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>{reasoning}</pre>
        </div>
      )}
    </div>
  );
}

function FollowUpQuestions({
  questions,
  onQuestionClick,
}: {
  questions: string[];
  onQuestionClick: (question: string) => void;
}) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[var(--chat-line)]">
      <div className="text-xs font-medium text-[var(--chat-muted)] mb-2 flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        你可能还想问
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="text-left text-sm px-3 py-1.5 rounded-full border border-[var(--chat-line)] bg-white text-[var(--chat-ink)] hover:border-[var(--chat-accent)] hover:text-[var(--chat-accent)] transition-colors duration-200 max-w-[280px] truncate"
            title={question}
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MessageCardProps {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string | null;
  followUpQuestions?: string[] | null;
  createdAt?: Date;
  pending?: boolean;
  assistantLabel?: string;
  onQuestionClick?: (question: string) => void;
  canEdit?: boolean;
  canRegenerate?: boolean;
  isEditing?: boolean;
  editDraft?: string;
  actionBusy?: boolean;
  onEditDraftChange?: (value: string) => void;
  onEditStart?: (messageId: string, content: string) => void;
  onEditCancel?: () => void;
  onEditSave?: () => void;
  onRegenerate?: (messageId: string) => void;
}

function MessageCard({
  id,
  role,
  content,
  reasoning,
  followUpQuestions,
  createdAt,
  pending,
  assistantLabel,
  onQuestionClick,
  canEdit,
  canRegenerate,
  isEditing,
  editDraft,
  actionBusy,
  onEditDraftChange,
  onEditStart,
  onEditCancel,
  onEditSave,
  onRegenerate,
}: MessageCardProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const label = isUser ? "You" : isAssistant ? assistantLabel || "Assistant" : "System";
  const hasReasoning = isAssistant && reasoning && reasoning.length > 0;
  const hasFollowUp = isAssistant && followUpQuestions && followUpQuestions.length > 0;

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
        {!pending && canEdit && id && !isEditing ? (
          <button
            type="button"
            onClick={() => onEditStart?.(id, content)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--chat-line)] px-2 py-1 text-[11px] text-[var(--chat-muted)] opacity-0 transition-all duration-200 group-hover:opacity-100 hover:border-[var(--chat-accent)] hover:text-[var(--chat-accent)]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 20h4l10.5-10.5a2.12 2.12 0 1 0-3-3L5 17v3Z" />
            </svg>
            编辑最后一句
          </button>
        ) : null}
        {!pending && canRegenerate && id ? (
          <button
            type="button"
            onClick={() => onRegenerate?.(id)}
            disabled={actionBusy}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--chat-line)] px-2 py-1 text-[11px] text-[var(--chat-muted)] opacity-0 transition-all duration-200 group-hover:opacity-100 hover:border-[var(--chat-accent)] hover:text-[var(--chat-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 4.5v5h5M19.5 19.5v-5h-5" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 9a8 8 0 0 0-13.66-4.95L4.5 5.5M4 15a8 8 0 0 0 13.66 4.95L19.5 18.5" />
            </svg>
            重新生成
          </button>
        ) : null}
      </div>
      {hasReasoning && <ReasoningPanel reasoning={reasoning} />}
      <div className="text-[15px] text-[var(--chat-ink)]">
        {isUser && isEditing ? (
          <div className="space-y-3 rounded-2xl border border-[var(--chat-line)] bg-white p-3">
            <textarea
              value={editDraft ?? ""}
              rows={3}
              autoFocus
              spellCheck={false}
              className="chat-textarea min-h-[96px] w-full resize-y rounded-xl border border-[var(--chat-line)] bg-transparent px-3 py-2 text-[15px] text-[var(--chat-ink)] outline-none"
              onChange={(event) => onEditDraftChange?.(event.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onEditCancel}
                className="rounded-full border border-[var(--chat-line)] px-3 py-1.5 text-sm text-[var(--chat-muted)] transition-colors hover:text-[var(--chat-ink)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onEditSave}
                disabled={actionBusy || !(editDraft ?? "").trim()}
                className="rounded-full bg-[var(--chat-accent)] px-3 py-1.5 text-sm text-white transition-all hover:bg-[#b95b30] disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存并重试
              </button>
            </div>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <MessageContent content={content} />
        )}
        {pending && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-[var(--chat-accent)] align-middle" />}
      </div>
      {hasFollowUp && (
        <FollowUpQuestions questions={followUpQuestions} onQuestionClick={onQuestionClick || (() => {})} />
      )}
    </article>
  );
}

interface PendingAssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  reasoning: string;
  model: string | null;
  modelLabel: string | null;
  createdAt: Date;
}

type SubmitIntent = "send" | "edit-last-user" | "regenerate-last-assistant";

interface SubmitPromptOptions {
  intent?: SubmitIntent;
  messageId?: string;
}

export default function ChatSessionPage() {
  const { models, session, messages: initialMessages, preferences } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<LoaderData["messages"]>(initialMessages);
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistantMessage | null>(null);

  // Ref for synchronous access to latest pending state (avoids React batching issues)
  const pendingAssistantRef = useRef<PendingAssistantMessage | null>(null);

  // Sync ref whenever state changes (for UI reads)
  useEffect(() => {
    pendingAssistantRef.current = pendingAssistant;
  }, [pendingAssistant]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(session.model);
  const [activeAssistantLabel, setActiveAssistantLabel] = useState(session.modelLabel);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [networkEnabled, setNetworkEnabled] = useState(preferences.chatNetworkEnabled);
  const [notice, setNotice] = useState<{ level: "info" | "warning"; message: string } | null>(null);

  // Persist network preference when toggled
  const persistNetworkPreference = useCallback(async (enabled: boolean) => {
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

  const handleNetworkToggle = useCallback((enabled: boolean) => {
    setNetworkEnabled(enabled);
    void persistNetworkPreference(enabled);
  }, [persistNetworkPreference]);

  // 保存模型选择到 localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("lastSelectedModel", selectedModel);
    }
  }, [selectedModel]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const hasAutoSubmittedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeModel = models.find((model) => model.id === selectedModel) ?? models[0];
  const lastMessage = messages[messages.length - 1] ?? null;
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const latestEditableUserMessage = (() => {
    if (!lastMessage) return null;
    if (lastMessage.role === "user") return lastMessage;
    if (lastMessage.role === "assistant") {
      const previousMessage = messages[messages.length - 2] ?? null;
      if (previousMessage?.role === "user") {
        return previousMessage;
      }
    }
    return null;
  })();
  const lastAssistantMessageId = [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (editingMessageId && !messages.some((message) => message.id === editingMessageId)) {
      setEditingMessageId(null);
      setEditDraft("");
    }
  }, [editingMessageId, messages]);

  useEffect(() => {
    setSelectedModel(session.model);
    setActiveAssistantLabel(session.modelLabel);
  }, [session.model, session.modelLabel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingAssistant?.content]);

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
    async (rawContent: string, model = selectedModel, options: SubmitPromptOptions = {}) => {
      const intent = options.intent ?? "send";
      const content = rawContent.trim();
      if ((intent === "send" || intent === "edit-last-user") && !content) return;

      setError(null);
      setIsStreaming(true);
      setPendingAssistant(null);
      setEditingMessageId(null);
      setEditDraft("");

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (formRef.current) {
        formRef.current.reset();
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      const selectedOption = models.find((item) => item.id === model) ?? activeModel;
      setActiveAssistantLabel(selectedOption?.label ?? session.modelLabel);
      const previousMessages = messages;

      let optimisticUserMessageId: string | null = null;
      if (intent === "send") {
        const optimisticUserMessage: LoaderData["messages"][number] = {
          id: `temp-${Date.now()}`,
          role: "user" as const,
          model: null,
          modelLabel: null,
          content: content.trim(),
          createdAt: new Date(),
        };
        optimisticUserMessageId = optimisticUserMessage.id;
        setMessages((prev) => [...prev, optimisticUserMessage]);
      } else if (intent === "edit-last-user") {
        setMessages((prev) => {
          const lastCurrent = prev[prev.length - 1] ?? null;
          return prev
            .filter((message) => !(lastCurrent?.role === "assistant" && message.id === lastCurrent.id))
            .map((message) =>
              message.id === options.messageId
                ? {
                    ...message,
                    content,
                  }
                : message
            );
        });
      } else if (intent === "regenerate-last-assistant") {
        setMessages((prev) => prev.filter((message) => message.id !== options.messageId));
      }

      // Initialize pending assistant message (ref first to avoid race conditions)
      const pendingId = `pending-${Date.now()}`;
      const initialPending: PendingAssistantMessage = {
        id: pendingId,
        role: "assistant",
        content: "",
        reasoning: "",
        model,
        modelLabel: selectedOption?.label ?? session.modelLabel,
        createdAt: new Date(),
      };
      pendingAssistantRef.current = initialPending;
      setPendingAssistant(initialPending);

      let streamCompleted = false;
      let streamStarted = false;
      const shouldRestorePreviousMessages = intent !== "send";

      const rollbackOptimisticUserMessage = () => {
        if (intent === "send" && optimisticUserMessageId) {
          setMessages((prev) => prev.filter((message) => message.id !== optimisticUserMessageId));
          return;
        }

        setMessages(previousMessages);
      };

      try {
        await fetchEventSource(`/chat/${session.id}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, model, intent, messageId: options.messageId, networkEnabled }),
          signal: abortController.signal,
          async onopen(response) {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
          },
          onmessage(event) {
            if (!event.data) return;

            try {
              const eventData = JSON.parse(event.data) as SSEEvent;

              switch (eventData.type) {
                case "start":
                  streamStarted = true;
                  setActiveAssistantLabel(selectedOption?.label ?? eventData.model);
                  break;

                case "token":
                  // Update ref immediately as source of truth, then trigger state update
                  if (pendingAssistantRef.current) {
                    pendingAssistantRef.current = {
                      ...pendingAssistantRef.current,
                      content: pendingAssistantRef.current.content + eventData.content,
                    };
                    setPendingAssistant(pendingAssistantRef.current);
                  }
                  break;

                case "reasoning":
                  // Update ref immediately as source of truth, then trigger state update
                  if (pendingAssistantRef.current) {
                    pendingAssistantRef.current = {
                      ...pendingAssistantRef.current,
                      reasoning: pendingAssistantRef.current.reasoning + eventData.content,
                    };
                    setPendingAssistant(pendingAssistantRef.current);
                  }
                  break;

                case "complete":
                  // Read from ref which is always up-to-date (updated synchronously in token/reasoning handlers)
                  const latestPending = pendingAssistantRef.current;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: eventData.messageId,
                      role: "assistant",
                      model,
                      modelLabel: selectedOption?.label ?? session.modelLabel,
                      content: eventData.content,
                      reasoning: latestPending?.reasoning || null,
                      followUpQuestions: null,
                      createdAt: new Date(),
                    },
                  ]);
                  pendingAssistantRef.current = null;
                  setPendingAssistant(null);
                  setIsStreaming(false);
                  streamCompleted = true;
                  break;

                case "suggestions":
                  // Merge suggestions into the corresponding assistant message
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === eventData.messageId
                        ? { ...msg, followUpQuestions: eventData.questions }
                        : msg
                    )
                  );
                  break;

                case "notice":
                  // Show non-fatal notice to user (e.g., search downgrade)
                  setNotice({ level: eventData.level, message: eventData.message });
                  // Auto-clear notice after 8 seconds
                  setTimeout(() => setNotice(null), 8000);
                  break;

                case "error":
                  if (!streamStarted || shouldRestorePreviousMessages) {
                    rollbackOptimisticUserMessage();
                  }
                  setError(eventData.message);
                  setIsStreaming(false);
                  pendingAssistantRef.current = null;
                  setPendingAssistant(null);
                  break;
              }
            } catch (parseError) {
              console.error("Failed to parse SSE event:", parseError);
            }
          },
          onclose() {
            if (!streamCompleted) {
              if (!streamStarted || shouldRestorePreviousMessages) {
                rollbackOptimisticUserMessage();
              }
              setIsStreaming(false);
              pendingAssistantRef.current = null;
              setPendingAssistant(null);
            }
          },
          onerror(err) {
            console.error("SSE error:", err);
            if (!streamStarted || shouldRestorePreviousMessages) {
              rollbackOptimisticUserMessage();
            }
            setError(err instanceof Error ? err.message : "Stream connection failed");
            setIsStreaming(false);
            pendingAssistantRef.current = null;
            setPendingAssistant(null);
            throw err;
          },
        });
      } catch (err) {
        // Don't show error for aborted requests
        if (err instanceof Error && err.name === "AbortError") {
          if (!streamStarted || shouldRestorePreviousMessages) {
            rollbackOptimisticUserMessage();
          }
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to send message";
        if (!streamStarted || shouldRestorePreviousMessages) {
          rollbackOptimisticUserMessage();
        }
        setError(message);
        setIsStreaming(false);
        pendingAssistantRef.current = null;
        setPendingAssistant(null);
      }
    },
    [activeModel, messages, models, selectedModel, session.id, session.modelLabel, networkEnabled]
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

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditDraft(content);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId) {
      return;
    }

    await submitPrompt(editDraft, selectedModel, {
      intent: "edit-last-user",
      messageId: editingMessageId,
    });
  }, [editDraft, editingMessageId, selectedModel, submitPrompt]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    await submitPrompt("", selectedModel, {
      intent: "regenerate-last-assistant",
      messageId,
    });
  }, [selectedModel, submitPrompt]);

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
                  id={message.id}
                  role={message.role}
                  content={message.content}
                  reasoning={message.reasoning}
                  followUpQuestions={
                    !isStreaming && message.role === "assistant" && message.id === lastAssistantMessageId
                      ? message.followUpQuestions
                      : null
                  }
                  createdAt={message.createdAt}
                  assistantLabel={message.modelLabel ?? activeAssistantLabel}
                  onQuestionClick={submitPrompt}
                  canEdit={!isStreaming && message.role === "user" && message.id === latestEditableUserMessage?.id}
                  canRegenerate={!isStreaming && message.role === "assistant" && message.id === lastMessage?.id && message.id === lastAssistantMessage?.id}
                  isEditing={message.id === editingMessageId}
                  editDraft={message.id === editingMessageId ? editDraft : undefined}
                  actionBusy={isStreaming}
                  onEditDraftChange={setEditDraft}
                  onEditStart={handleStartEdit}
                  onEditCancel={handleCancelEdit}
                  onEditSave={handleSaveEdit}
                  onRegenerate={handleRegenerate}
                />
              ))}

              {isStreaming && pendingAssistant && (
                <MessageCard
                  role="assistant"
                  content={pendingAssistant.content || "..."}
                  reasoning={pendingAssistant.reasoning || null}
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
          {notice && (
            <div
              className={`mb-4 rounded-[22px] border px-4 py-3 text-sm ${
                notice.level === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {notice.message}
            </div>
          )}

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
                  spellCheck={false}
                  className="chat-textarea max-h-[220px] min-h-[62px] w-full resize-none bg-transparent px-2 py-2 text-[15px] text-[var(--chat-ink)] outline-none placeholder:text-[var(--chat-muted)]/70"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
              <div className="flex items-center gap-4">
                <span>Enter to send, Shift + Enter for a new line.</span>
                <button
                  type="button"
                  onClick={() => handleNetworkToggle(!networkEnabled)}
                  disabled={isStreaming}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                    networkEnabled
                      ? "border-[var(--chat-accent)] bg-[rgba(199,103,58,0.1)] text-[var(--chat-accent)]"
                      : "border-[var(--chat-line)] bg-gray-50 hover:border-gray-300"
                  }`}
                  title={networkEnabled ? "Network search enabled" : "Network search disabled"}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span className="text-[11px] font-medium">{networkEnabled ? "Online" : "Offline"}</span>
                </button>
              </div>
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
