import type { Route } from "./+types/index";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New Chat - OWU" },
    { name: "description", content: "Start a new conversation" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getAvailableModels } = await import("~/lib/server/chat.server");

  requireUser(session);
  const models = await getAvailableModels();

  return { models };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { createChatSession } = await import("~/lib/server/chat.server");
  const user = requireUser(session);

  const formData = await request.formData();
  const model = formData.get("model") as string;
  const prompt = formData.get("prompt") as string;

  if (!model || model.trim() === "") {
    return { error: "Please select a model" };
  }

  if (!prompt || prompt.trim() === "") {
    return { error: "Please enter a question" };
  }

  const normalizedPrompt = prompt.trim();
  const sessionTitle = normalizedPrompt.length > 60 ? `${normalizedPrompt.slice(0, 57)}...` : normalizedPrompt;

  try {
    const chatSession = await createChatSession(user, {
      model: model.trim(),
      title: sessionTitle,
    });

    // 将 prompt 编码到 URL 参数中，进入对话页后会自动发送
    const params = new URLSearchParams();
    params.set("q", encodeURIComponent(normalizedPrompt));
    params.set("model", model.trim());
    
    return redirect(`/chat/${chatSession.id}?${params.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create chat session";
    return { error: message };
  }
}

export default function ChatIndexPage() {
  const { models } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedModel, setSelectedModel] = useState(models[0]?.id ?? "");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const activeModel = models.find((model) => model.id === selectedModel) ?? models[0];

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

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-12 lg:py-8 xl:px-16">
      <div className="flex min-h-[44px] items-start">
        {models.length > 0 ? (
          <div ref={modelMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-200 ease-out hover:bg-white/60 hover:shadow-sm active:scale-95"
              aria-haspopup="listbox"
              aria-expanded={isModelMenuOpen}
            >
              <span className="min-w-[150px] text-left text-base font-medium text-[var(--chat-ink)]">
                {activeModel?.label ?? selectedModel}
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
              <div className="absolute left-0 top-[calc(100%+0.6rem)] z-20 min-w-[260px] overflow-hidden rounded-xl border border-[var(--chat-line)] bg-white p-2 shadow-lg animate-fade-in-up">
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
        ) : (
          <div className="rounded-[22px] border border-[rgba(199,103,58,0.2)] bg-[rgba(199,103,58,0.08)] px-4 py-3 text-sm text-[var(--chat-muted)]">
            No model available
          </div>
        )}
      </div>

      <div className="relative mx-auto flex w-full max-w-[1560px] flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-0 py-8 sm:py-12 lg:py-16 xl:py-20">
          <div className="w-full max-w-[1080px]">
            {models.length === 0 ? (
              <div className="rounded-[24px] border border-[rgba(199,103,58,0.2)] bg-[rgba(199,103,58,0.08)] p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--chat-accent)] shadow-sm">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m0 3.75h.01M10.33 3.86 1.82 18a2.25 2.25 0 0 0 1.93 3.37h16.5A2.25 2.25 0 0 0 22.18 18L13.67 3.86a2.25 2.25 0 0 0-3.34 0Z" />
                  </svg>
                </div>
                <h2 className="mt-4 font-serif text-2xl text-[var(--chat-ink)]">No models available</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--chat-muted)]">
                  An administrator needs to configure at least one model before a session can start.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    to="/admin"
                    className="rounded-full bg-[var(--chat-forest)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1f463b]"
                  >
                    Go to admin
                  </Link>
                  <Link
                    to="/chat"
                    className="rounded-full border border-[var(--chat-line)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--chat-ink)] hover:bg-white/80"
                  >
                    Stay here
                  </Link>
                </div>
              </div>
            ) : (
              <Form method="post" className="mx-auto w-full max-w-[860px]">
                <input type="hidden" name="model" value={selectedModel} />

                {actionData?.error && (
                  <div className="mb-3 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {actionData.error}
                  </div>
                )}

                <div className="chat-input-shadow chat-input-shell rounded-[28px] border border-[var(--chat-line)] bg-white/92 px-4 py-3 sm:px-5 sm:py-4">
                  <textarea
                    ref={textareaRef}
                    id="prompt"
                    name="prompt"
                    placeholder="How can I help you today?"
                    rows={4}
                    className="chat-textarea min-h-[120px] max-h-[320px] w-full resize-none border-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-[var(--chat-ink)] outline-none placeholder:text-[var(--chat-muted)]/70 sm:text-base"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const form = event.currentTarget.form;
                        form?.requestSubmit();
                      }
                    }}
                    onInput={(event) => {
                      const target = event.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 320)}px`;
                    }}
                  />

                  <div className="mt-3 flex items-center justify-between border-t border-[var(--chat-line)] pt-3 text-[var(--chat-muted)]">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-line)] bg-white/70">+</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-line)] bg-white/70">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h10M4 17h7" />
                        </svg>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs sm:inline">{activeModel?.label ?? selectedModel}</span>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f1f1f] text-white transition-all duration-200 ease-out hover:bg-black hover:shadow-md hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
                        aria-label="Start session"
                      >
                        {isSubmitting ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Zm2 5.29A7.94 7.94 0 0 1 4 12H0c0 3.04 1.14 5.82 3 7.94l3-2.65Z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6 6 6-6 6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </Form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
