import { useState, type ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

async function copyToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Clipboard is not available outside browser context");
  }

  if (window.isSecureContext && window.navigator.clipboard?.writeText) {
    await window.navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  try {
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command failed");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      type="button"
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function BookmarkButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
      title="收藏到 Notion 空间"
      aria-label="收藏到 Notion 空间"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z" />
      </svg>
    </button>
  );
}

export function formatCodeLanguageLabel(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "Text";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

interface CodeBlockCardProps {
  language: string;
  codeContent: string;
  className?: string;
  onBookmarkRequest?: () => void;
  actions?: ReactNode;
  maxHeight?: string;
}

export function CodeBlockCard({
  language,
  codeContent,
  className,
  onBookmarkRequest,
  actions,
  maxHeight,
}: CodeBlockCardProps) {
  const languageLabel = formatCodeLanguageLabel(language || "text");

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-[rgba(20,33,28,0.15)] bg-[#1a2822] shadow-lg transition-all duration-200 hover:shadow-xl",
        className || "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#14211c] px-4 py-2.5">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className="truncate text-[11px] font-semibold tracking-[0.14em] text-[var(--chat-accent)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {languageLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {onBookmarkRequest ? <BookmarkButton onClick={onBookmarkRequest} /> : null}
          <CopyButton text={codeContent} />
        </div>
      </div>
      <div className="relative">
        <div className={maxHeight ? "overflow-auto" : ""} style={{ maxHeight: maxHeight || undefined }}>
          <SyntaxHighlighter
            language={language || "text"}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "transparent",
              fontSize: "13px",
              lineHeight: "1.6",
              fontFamily: "var(--font-mono)",
            }}
            codeTagProps={{
              style: {
                fontFamily: "var(--font-mono)",
              },
            }}
          >
            {codeContent}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}
