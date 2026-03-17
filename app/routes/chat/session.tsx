import type { Route } from "./+types/session";
import { useLoaderData, Link } from "react-router";
import { getSession } from "~/sessions";
import { useEffect, useRef, useState, useCallback } from "react";

type SSEEvent =
  | { type: "start"; sessionId: string; model: string }
  | { type: "token"; content: string }
  | { type: "complete"; messageId: string; content: string }
  | { type: "error"; message: string };

export function meta({ data }: Route.MetaArgs) {
  const session = data?.session;
  return [
    { title: `${session?.title || 'Chat'} - OWU` },
    { name: "description", content: "Chat conversation" },
  ];
}

interface LoaderData {
  session: {
    id: string;
    title: string;
    model: string;
    createdAt: Date;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: Date;
  }>;
}

/**
 * Loader: Load chat session and messages
 */
export async function loader({ request, params }: Route.LoaderArgs): Promise<LoaderData> {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getChatMessages, getChatSessionMeta } = await import("~/lib/server/index.server");
  const user = requireUser(cookieSession);

  const sessionId = params.sessionId;
  if (!sessionId) {
    throw new Response("Session ID required", { status: 400 });
  }

  try {
    // Get messages with ownership check
    const messages = await getChatMessages(sessionId, user);
    
    // Get session metadata using unified helper
    const session = await getChatSessionMeta(sessionId, user);

    return { session, messages };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Failed to load chat session", { status: 500 });
  }
}

/**
 * Format message timestamp
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Render message content with basic markdown-like formatting
 */
function MessageContent({ content }: { content: string }) {
  // Simple paragraph splitting
  const paragraphs = content.split("\n\n");

  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph, idx) => {
        // Check if it's a code block
        if (paragraph.startsWith("```") && paragraph.endsWith("```")) {
          const code = paragraph.slice(3, -3).trim();
          const lines = code.split("\n");
          const language = lines[0];
          const codeContent = lines.slice(1).join("\n");

          return (
            <div key={idx} className="my-2 rounded-lg overflow-hidden bg-gray-900">
              {language && (
                <div className="px-4 py-1 bg-gray-800 text-xs text-gray-400">
                  {language}
                </div>
              )}
              <pre className="p-4 overflow-x-auto">
                <code className="text-sm text-gray-100 font-mono">
                  {codeContent || code}
                </code>
              </pre>
            </div>
          );
        }

        // Inline code
        if (paragraph.includes("`")) {
          const parts = paragraph.split(/(`[^`]+`)/);
          return (
            <p key={idx} className="leading-relaxed">
              {parts.map((part, partIdx) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return (
                    <code
                      key={partIdx}
                      className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono"
                    >
                      {part.slice(1, -1)}
                    </code>
                  );
                }
                return <span key={partIdx}>{part}</span>;
              })}
            </p>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {paragraph}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Streaming message component - shows assistant response being built
 */
function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 md:gap-4 animate-fade-in">
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 text-white">
        <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-14a4 4 0 00-4 4h8a4 4 0 00-4-4z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] md:max-w-[80%]">
        <div className="inline-block text-left px-3 py-2 md:px-4 md:py-3 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-700">
          <MessageContent content={content} />
          <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function ChatSessionPage() {
  const { session, messages: initialMessages } = useLoaderData<typeof loader>();
  const [messages, setMessages] = useState(initialMessages);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update messages when loader data changes (on navigation)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-scroll to bottom when new messages arrive or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Handle SSE streaming
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const content = formData.get("content") as string;
    
    if (!content || content.trim() === "") return;

    setError(null);
    setIsStreaming(true);
    setStreamingContent("");

    // Clear form
    if (formRef.current) {
      formRef.current.reset();
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // Create optimistic user message
      const optimisticUserMessage = {
        id: `temp-${Date.now()}`,
        role: 'user' as const,
        content: content.trim(),
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, optimisticUserMessage]);

      // Start SSE stream
      const response = await fetch(`/chat/${session.id}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to send message");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      // Read SSE stream
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
        
        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

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
                  // Stream started
                  break;
                  
                case "token":
                  assistantContent += eventData.content;
                  setStreamingContent(assistantContent);
                  break;
                  
                case "complete":
                  // Add assistant message to messages list
                  setMessages(prev => [
                    ...prev,
                    {
                      id: eventData.messageId,
                      role: 'assistant',
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
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
            
            currentEvent = null;
          } else if (line === "" && currentEvent) {
            // End of event
            currentEvent = null;
          }
        }
      }

      // Only reload on successful completion, not on error
      // Error state is preserved so user can see the error message
      if (streamCompleted && !streamError) {
        window.location.reload();
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      setIsStreaming(false);
    }
  }, [session.id]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Chat header */}
      <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between bg-white dark:bg-gray-950 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <h1 className="font-medium truncate text-sm md:text-base">
            {session.title}
          </h1>
          <span className="text-xs px-2 py-0.5 md:py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400 flex-shrink-0">
            {session.model}
          </span>
        </div>
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          <Link
            to="/chat"
            className="text-xs md:text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 md:px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">New Chat</span>
          </Link>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-gray-50 dark:bg-gray-900 min-h-0">
        <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
          {/* Empty state */}
          {messages.length === 0 && !isStreaming ? (
            <div className="text-center py-8 md:py-12 animate-fade-in">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 md:w-7 md:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">
                Start the conversation by sending a message
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Your messages will appear here
              </p>
            </div>
          ) : (
            <>
              {/* Message list */}
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex gap-2 md:gap-4 animate-slide-up ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                        : "bg-gradient-to-br from-green-500 to-green-600 text-white"
                    }`}
                  >
                    {message.role === "user" ? (
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-14a4 4 0 00-4 4h8a4 4 0 00-4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={`flex-1 min-w-0 max-w-[85%] md:max-w-[80%] ${
                    message.role === "user" ? "text-right" : ""
                  }`}>
                    <div className={`inline-block text-left px-3 py-2 md:px-4 md:py-3 rounded-2xl ${
                      message.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-700"
                    }`}>
                      <MessageContent content={message.content} />
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {formatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming message */}
              {isStreaming && streamingContent && (
                <StreamingMessage content={streamingContent} />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3 md:p-4 bg-white dark:bg-gray-950 safe-bottom flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Error display */}
          {error && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 animate-fade-in">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-800 dark:text-red-200 flex-1">
                  {error}
                </p>
                <button
                  onClick={() => setError(null)}
                  className="text-red-500 hover:text-red-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Input form */}
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex gap-2 items-end"
          >
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                name="content"
                placeholder={isStreaming ? "AI is responding..." : "Type your message..."}
                required
                rows={1}
                disabled={isStreaming}
                className="w-full px-3 py-2.5 md:px-4 md:py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none min-h-[44px] max-h-[150px] md:max-h-[200px] text-sm md:text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, window.innerWidth < 768 ? 150 : 200)}px`;
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isStreaming}
              className="px-3 py-2.5 md:px-4 md:py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
              aria-label="Send message"
            >
              {isStreaming ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500 text-center hidden sm:block">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
