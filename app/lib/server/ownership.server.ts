import { prisma } from './db.server';
import { getSystemConfig, resolveModelReferenceFromProviders } from './config.server';
import type { SessionData } from './session.server';

/**
 * Server-only ownership and access control helpers.
 * These ensure users can only access their own data.
 */

/**
 * Assert that a chat session belongs to the user.
 * Returns the session if owned by user, throws 403 if not.
 */
export async function assertChatSessionOwnership(
  sessionId: string,
  user: SessionData
): Promise<{
  id: string;
  title: string;
  userId: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });

  if (!chatSession) {
    throw new Response('Chat session not found', { status: 404 });
  }

  // Admin can access any session, regular users only their own
  if (user.role !== 'admin' && chatSession.userId !== user.userId) {
    throw new Response('Forbidden: You do not have access to this chat session', {
      status: 403,
    });
  }

  return chatSession;
}

/**
 * Get all chat sessions for a user.
 * Admins can optionally see all sessions (for admin views).
 */
export async function getUserChatSessions(
  user: SessionData,
  options?: { includeAll?: boolean }
): Promise<Array<{
  id: string;
  title: string;
  model: string;
  modelName: string;
  modelLabel: string;
  providerLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
}>> {
  const where = options?.includeAll && user.role === 'admin'
    ? {}
    : { userId: user.userId };

  const sessions = await prisma.chatSession.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { messages: true },
      },
    },
  });

  const config = await getSystemConfig();

  return sessions.map((session) => {
    const resolvedModel = config
      ? resolveModelReferenceFromProviders(session.model, config.providers)
      : null;

    return {
      ...session,
      modelName: resolvedModel?.model ?? session.model,
      modelLabel: resolvedModel?.label ?? session.model,
      providerLabel: resolvedModel?.providerLabel ?? null,
    };
  });
}

/**
 * Get chat messages for a session with ownership check.
 * Returns messages with reasoning and follow-up questions for assistant messages.
 */
export async function getChatMessages(
  sessionId: string,
  user: SessionData
): Promise<Array<{
  id: string;
  role: 'user' | 'assistant' | 'system';
  model: string | null;
  modelLabel: string | null;
  content: string;
  reasoning?: string | null;
  followUpQuestions?: string[] | null;
  createdAt: Date;
}>> {
  // First verify ownership
  const session = await assertChatSessionOwnership(sessionId, user);

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      model: true,
      content: true,
      reasoning: true,
      followUpQuestions: true,
      createdAt: true,
    },
  });

  const config = await getSystemConfig();
  const fallbackModel = config
    ? resolveModelReferenceFromProviders(session.model, config.providers)
    : null;

  return messages.map((message) => {
    const resolvedModel = message.model && config
      ? resolveModelReferenceFromProviders(message.model, config.providers)
      : null;

    // Parse followUpQuestions from JSON if present
    const followUpQuestions = message.followUpQuestions && Array.isArray(message.followUpQuestions)
      ? message.followUpQuestions as string[]
      : null;

    return {
      id: message.id,
      role: message.role as 'user' | 'assistant' | 'system',
      model: message.model,
      modelLabel: resolvedModel?.label ?? (message.role === 'assistant' ? fallbackModel?.label ?? session.model : null),
      content: message.content,
      reasoning: message.reasoning,
      followUpQuestions,
      createdAt: message.createdAt,
    };
  });
}

/**
 * Check if user can access admin routes
 */
export function canAccessAdmin(user: SessionData): boolean {
  return user.role === 'admin';
}

/**
 * Check if user can modify system config
 */
export function canModifySystemConfig(user: SessionData): boolean {
  return user.role === 'admin';
}
