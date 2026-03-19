import type { Route } from "./+types/notion-space";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { useCallback, useMemo, useState } from "react";
import { CodeBlockCard } from "~/components/chat/code-block-card";
import { getSession } from "~/sessions";

function formatBookmarkTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : "Untitled snippet";
}

function getCodeLineCount(codeContent: string) {
  const normalized = codeContent.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) {
    return 0;
  }

  return normalized.split("\n").length;
}

function formatBookmarkDate(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Notion 空间 - OWU" },
    { name: "description", content: "管理收藏的代码块" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getUserBookmarks } = await import("~/lib/server/bookmark.server");

  const user = requireUser(cookieSession);
  const bookmarks = await getUserBookmarks(user, { includeCodeContent: true });

  return { bookmarks };
}

export default function NotionSpacePage() {
  const { bookmarks } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [deletingBookmarkId, setDeletingBookmarkId] = useState<string | null>(null);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  const totalLines = useMemo(
    () => bookmarks.reduce((sum, bookmark) => sum + getCodeLineCount(bookmark.codeContent ?? ""), 0),
    [bookmarks]
  );

  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    if (deletingBookmarkId) {
      return;
    }

    setBookmarkError(null);
    setDeletingBookmarkId(bookmarkId);

    try {
      const response = await fetch(`/api/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "删除书签失败");
      }

      revalidator.revalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除书签失败";
      setBookmarkError(message);
    } finally {
      setDeletingBookmarkId(null);
    }
  }, [deletingBookmarkId, revalidator]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-[var(--chat-line)] bg-[var(--chat-panel)] shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="relative border-b border-[var(--chat-line)] px-6 py-6 sm:px-8">
            <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(29,78,216,0.03))]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] bg-white/80 px-3 py-1 text-[11px] tracking-[0.18em] text-[var(--chat-muted)] backdrop-blur">
                  <span className="inline-flex h-2 w-2 rounded-full bg-[var(--chat-accent)]" />
                  CODE LIBRARY
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--chat-ink)] sm:text-[2.5rem]">
                  Notion 空间
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--chat-muted)] sm:text-[15px]">
                  这里集中管理你收藏的代码块。每段代码保留原始语言标记、来源会话和完整内容。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--chat-line)] bg-white/90 px-4 py-3">
                  <div className="text-xs text-[var(--chat-muted)]">代码块</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--chat-ink)]">{bookmarks.length}</div>
                </div>
                <div className="rounded-2xl border border-[var(--chat-line)] bg-white/90 px-4 py-3">
                  <div className="text-xs text-[var(--chat-muted)]">总行数</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--chat-ink)]">{totalLines}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {bookmarkError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {bookmarkError}
          </div>
        ) : null}

        {bookmarks.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-[var(--chat-line)] bg-[var(--chat-panel)] px-6 py-14 text-center sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h8M8 11h8M8 15h5" />
              </svg>
            </div>
            <h2 className="mt-5 text-xl font-semibold text-[var(--chat-ink)]">还没有收藏的代码块</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--chat-muted)]">
              回到对话页，在代码块右上角点击书签图标，就会把内容保存到这里。
            </p>
            <Link
              to="/chat"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--chat-accent)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              去收藏代码
            </Link>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-2">
            {bookmarks.map((bookmark) => {
              const codeContent = bookmark.codeContent ?? bookmark.codePreview;
              const lineCount = getCodeLineCount(codeContent);

              return (
                <article
                  key={bookmark.id}
                  className="overflow-hidden rounded-[28px] border border-[var(--chat-line)] bg-[var(--chat-panel)] shadow-[0_18px_48px_rgba(15,23,42,0.05)]"
                >
                  <div className="border-b border-[var(--chat-line)] px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-[var(--chat-ink)]">
                          {formatBookmarkTitle(bookmark.title)}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--chat-muted)]">
                          <span>{formatBookmarkDate(bookmark.createdAt)}</span>
                          <span>{lineCount} 行</span>
                          {bookmark.lineNumber ? <span>起始行 {bookmark.lineNumber}</span> : null}
                          <span className={bookmark.isSessionActive ? "text-emerald-600" : "text-red-500"}>
                            {bookmark.isSessionActive ? "来源会话可用" : "来源会话已失效"}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteBookmark(bookmark.id)}
                        disabled={deletingBookmarkId === bookmark.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chat-line)] text-[var(--chat-muted)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="删除书签"
                        title="删除书签"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {bookmark.isSessionActive ? (
                        <Link
                          to={`/chat/${bookmark.sessionId}`}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-line)] px-3 py-1.5 text-sm text-[var(--chat-ink)] transition-colors hover:bg-[var(--chat-hover-bg)]"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.85 9.85 0 0 1-4.25-.95L3 20l1.4-3.72A8.94 8.94 0 0 1 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8Z" />
                          </svg>
                          打开来源会话
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <CodeBlockCard language={bookmark.language} codeContent={codeContent} maxHeight="200px" />
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
