import { prisma } from './db.server';
import { assertChatSessionOwnership } from './ownership.server';
import type { SessionData } from './session.server';

const MAX_BOOKMARKS_PER_USER = 250;

export interface UserCodeBookmark {
  id: string;
  sessionId: string;
  messageId: string;
  title: string;
  codePreview: string;
  codeContent?: string;
  language: string;
  lineNumber: number | null;
  createdAt: Date;
  isSessionActive: boolean;
}

interface GetUserBookmarksOptions {
  includeCodeContent?: boolean;
}

export interface CreateBookmarkInput {
  sessionId: string;
  messageId: string;
  title?: string;
  codeContent: string;
  language?: string;
  lineNumber?: number;
}

function sanitizeBookmarkTitle(title: string | undefined, codeContent: string): string {
  const candidate = (title ?? '').replace(/\s+/g, ' ').trim();
  if (candidate.length > 0) {
    return candidate.slice(0, 120);
  }

  const preview = buildCodePreview(codeContent);
  return preview.length > 0 ? preview : 'Untitled snippet';
}

function buildCodePreview(codeContent: string): string {
  const normalized = codeContent.replace(/\r\n/g, '\n').trim();
  const firstLine = normalized.split('\n').find((line) => line.trim().length > 0) ?? '';
  const singleLine = firstLine.replace(/\s+/g, ' ').trim();
  return singleLine.length > 30 ? `${singleLine.slice(0, 30)}...` : singleLine;
}

function sanitizeLanguage(language: string | undefined): string {
  const normalized = (language ?? '').trim().toLowerCase();
  return normalized.length > 0 ? normalized.slice(0, 32) : 'text';
}

export async function getUserBookmarks(
  user: SessionData,
  options: GetUserBookmarksOptions = {}
): Promise<UserCodeBookmark[]> {
  const { includeCodeContent = false } = options;
  const bookmarks = await prisma.codeBookmark.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_BOOKMARKS_PER_USER,
    select: {
      id: true,
      sessionId: true,
      messageId: true,
      title: true,
      codePreview: true,
      codeContent: includeCodeContent,
      language: true,
      lineNumber: true,
      createdAt: true,
    },
  });

  const uniqueSessionIds = Array.from(new Set(bookmarks.map((bookmark) => bookmark.sessionId)));
  const existingSessions = uniqueSessionIds.length > 0
    ? await prisma.chatSession.findMany({
        where: {
          id: { in: uniqueSessionIds },
          userId: user.userId,
        },
        select: { id: true },
      })
    : [];

  const activeSessionIds = new Set(existingSessions.map((session) => session.id));

  return bookmarks.map((bookmark) => ({
    ...bookmark,
    isSessionActive: activeSessionIds.has(bookmark.sessionId),
  }));
}

export async function createBookmark(user: SessionData, input: CreateBookmarkInput): Promise<UserCodeBookmark> {
  const sessionId = input.sessionId.trim();
  const messageId = input.messageId.trim();
  const codeContent = input.codeContent.replace(/\r\n/g, '\n').trimEnd();

  if (!sessionId || !messageId || !codeContent) {
    throw new Response('Invalid bookmark payload', { status: 400 });
  }

  const existingCount = await prisma.codeBookmark.count({
    where: { userId: user.userId },
  });
  if (existingCount >= MAX_BOOKMARKS_PER_USER) {
    throw new Response(`最多只能保存 ${MAX_BOOKMARKS_PER_USER} 个书签`, { status: 400 });
  }

  await assertChatSessionOwnership(sessionId, user);

  const targetMessage = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      sessionId,
    },
    select: { id: true },
  });

  if (!targetMessage) {
    throw new Response('消息不存在或不属于当前会话', { status: 404 });
  }

  const created = await prisma.codeBookmark.create({
    data: {
      userId: user.userId,
      sessionId,
      messageId,
      title: sanitizeBookmarkTitle(input.title, codeContent),
      codePreview: buildCodePreview(codeContent),
      codeContent,
      language: sanitizeLanguage(input.language),
      lineNumber: typeof input.lineNumber === 'number' ? input.lineNumber : null,
    },
    select: {
      id: true,
      sessionId: true,
      messageId: true,
      title: true,
      codePreview: true,
      language: true,
      lineNumber: true,
      createdAt: true,
    },
  });

  return {
    ...created,
    isSessionActive: true,
  };
}

export async function deleteBookmark(user: SessionData, bookmarkId: string): Promise<void> {
  const id = bookmarkId.trim();
  if (!id) {
    throw new Response('Bookmark ID required', { status: 400 });
  }

  const bookmark = await prisma.codeBookmark.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!bookmark) {
    throw new Response('Bookmark not found', { status: 404 });
  }

  if (bookmark.userId !== user.userId) {
    throw new Response('Forbidden', { status: 403 });
  }

  await prisma.codeBookmark.delete({
    where: { id },
  });
}
