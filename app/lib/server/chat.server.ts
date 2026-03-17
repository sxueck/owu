import { prisma } from './db.server';
import {
  sendChatCompletion,
  streamChatCompletion,
  type ChatCompletionMessage,
  type ChatCompletionResult,
} from './openai.server';
import {
  getAvailableModelOptions,
  isOpenAIConfigured,
  resolveModelReference,
} from './config.server';
import { assertChatSessionOwnership } from './ownership.server';
import type { SessionData } from './session.server';

/**
 * Server-only chat service.
 * Handles chat session creation, message sending, and OpenAI integration.
 */

export interface CreateChatSessionInput {
  title?: string;
  model: string;
}

export interface AvailableChatModel {
  id: string;
  model: string;
  providerId: string;
  providerLabel: string;
  label: string;
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
  model?: string;
}

export interface ChatMessageOutput {
  id: string;
  role: 'user' | 'assistant' | 'system';
  model?: string | null;
  content: string;
  createdAt: Date;
}

export interface SendMessageResult {
  userMessage: ChatMessageOutput;
  assistantMessage: ChatMessageOutput;
}

function sanitizeSessionTitle(title?: string): string {
  const plainTitle = (title ?? '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return plainTitle || 'New Chat';
}

/**
 * Create a new chat session for a user.
 * Validates that the selected model is in the allowed list.
 * 
 * @throws Error if model is not allowed
 * @throws Error if OpenAI is not configured
 */
export async function createChatSession(
  user: SessionData,
  input: CreateChatSessionInput
): Promise<{ id: string; title: string; model: string; createdAt: Date }> {
  // Validate model is allowed
  const resolvedModel = await resolveModelReference(input.model);
  if (!resolvedModel) {
    throw new Error(`Model "${input.model}" is not in the allowed list. Please select a different model.`);
  }

  // Validate OpenAI is configured
  const configured = await isOpenAIConfigured();
  if (!configured) {
    throw new Error('OpenAI is not configured. Please contact administrator.');
  }

  // Create session
  const session = await prisma.chatSession.create({
    data: {
      userId: user.userId,
      title: sanitizeSessionTitle(input.title),
      model: resolvedModel.id,
    },
  });

  return {
    id: session.id,
    title: session.title,
      model: resolvedModel.id,
      createdAt: session.createdAt,
    };
}

/**
 * Send a message in a chat session and get AI response.
 * 
 * Flow:
 * 1. Verify user owns the session
 * 2. Validate OpenAI configuration
 * 3. Save user message to database
 * 4. Call OpenAI API with conversation history
 * 5. Save assistant response to database
 * 
 * @throws Error if session not found or user doesn't have access
 * @throws Error if OpenAI is not configured
 * @throws Error if API call fails
 */
export async function sendMessage(
  user: SessionData,
  input: SendMessageInput
): Promise<SendMessageResult> {
  // Step 1: Verify ownership and get session
  const session = await assertChatSessionOwnership(input.sessionId, user);

  // Step 2: Validate OpenAI configuration
  const configured = await isOpenAIConfigured();
  if (!configured) {
    throw new Error('OpenAI is not configured. Please contact administrator.');
  }

  const sessionModelId = input.model?.trim() || session.model;

  // Validate model is still allowed (admin may have changed whitelist)
  const resolvedModel = await resolveModelReference(sessionModelId);
  if (!resolvedModel) {
    throw new Error(`Model "${sessionModelId}" is no longer available. Please select a different model.`);
  }

  if (session.model !== resolvedModel.id) {
    await prisma.chatSession.update({
      where: { id: input.sessionId },
      data: { model: resolvedModel.id },
    });
  }

  // Step 3: Save user message
  const userMessage = await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: 'user',
      content: input.content.trim(),
    },
  });

  try {
    // Step 4: Get conversation history and call OpenAI
    const history: Array<{ role: string; content: string }> = await prisma.chatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const messages: ChatCompletionMessage[] = history.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    const completion = await sendChatCompletion({
      model: resolvedModel.model,
      provider: resolvedModel.provider,
      messages,
    });

    // Step 5: Save assistant response
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: 'assistant',
        model: resolvedModel.id,
        content: completion.content,
      },
    });

    // Update session's updatedAt timestamp
    await prisma.chatSession.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      userMessage: {
        id: userMessage.id,
        role: 'user',
        model: null,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: 'assistant',
        model: resolvedModel.id,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    };
  } catch (error) {
    // If OpenAI call fails, we still have the user message saved
    // but we don't save a fake assistant response
    // Re-throw the error so caller can handle it
    throw error;
  }
}

/**
 * Get available models for the user to choose from.
 * Returns the allowed models list from system config.
 */
export async function getAvailableModels(): Promise<AvailableChatModel[]> {
  return getAvailableModelOptions();
}

/**
 * Update chat session title.
 * Only the session owner can update the title.
 */
export async function updateSessionTitle(
  user: SessionData,
  sessionId: string,
  title: string
): Promise<void> {
  await assertChatSessionOwnership(sessionId, user);

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { title: sanitizeSessionTitle(title) },
  });
}

/**
 * Delete a chat session and all its messages.
 * Only the session owner can delete.
 */
export async function deleteChatSession(
  user: SessionData,
  sessionId: string
): Promise<void> {
  await assertChatSessionOwnership(sessionId, user);

  await prisma.chatSession.delete({
    where: { id: sessionId },
  });
}

/**
 * Get chat session metadata with ownership check.
 * This is a thin wrapper over assertChatSessionOwnership that returns
 * only the metadata needed for UI display.
 */
export async function getChatSessionMeta(
  sessionId: string,
  user: SessionData
): Promise<{
  id: string;
  title: string;
  model: string;
  modelName: string;
  modelLabel: string;
  providerLabel: string | null;
  createdAt: Date;
}> {
  const session = await assertChatSessionOwnership(sessionId, user);
  const resolvedModel = await resolveModelReference(session.model);

  return {
    id: session.id,
    title: session.title,
    model: session.model,
    modelName: resolvedModel?.model ?? session.model,
    modelLabel: resolvedModel?.label ?? session.model,
    providerLabel: resolvedModel?.providerLabel ?? null,
    createdAt: session.createdAt,
  };
}

/**
 * SSE event types for streaming chat
 */
export type SSEEvent =
  | { type: 'start'; sessionId: string; model: string }
  | { type: 'token'; content: string }
  | { type: 'complete'; messageId: string; content: string }
  | { type: 'error'; message: string };

/**
 * Send a message in a chat session with streaming response.
 * 
 * Flow:
 * 1. Verify user owns the session
 * 2. Validate OpenAI configuration
 * 3. Save user message to database
 * 4. Call OpenAI API with streaming
 * 5. Stream tokens via onEvent callback
 * 6. Only save assistant response after stream completes successfully
 * 
 * @throws Error if session not found or user doesn't have access
 * @throws Error if OpenAI is not configured
 * @throws Error if API call fails
 */
export async function sendMessageStream(
  user: SessionData,
  input: SendMessageInput,
  onEvent: (event: SSEEvent) => void | Promise<void>
): Promise<void> {
  // Step 1: Verify ownership and get session
  const session = await assertChatSessionOwnership(input.sessionId, user);

  // Step 2: Validate OpenAI configuration
  const configured = await isOpenAIConfigured();
  if (!configured) {
    const error = new Error('OpenAI is not configured. Please contact administrator.');
    await onEvent({ type: 'error', message: error.message });
    throw error;
  }

  const sessionModelId = input.model?.trim() || session.model;

  // Validate model is still allowed (admin may have changed whitelist)
  const resolvedModel = await resolveModelReference(sessionModelId);
  if (!resolvedModel) {
    const error = new Error(`Model "${sessionModelId}" is no longer available. Please select a different model.`);
    await onEvent({ type: 'error', message: error.message });
    throw error;
  }

  if (session.model !== resolvedModel.id) {
    await prisma.chatSession.update({
      where: { id: input.sessionId },
      data: { model: resolvedModel.id },
    });
  }

  // Step 3: Save user message
  const userMessage = await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: 'user',
      content: input.content.trim(),
    },
  });

  // Notify stream start
  await onEvent({ type: 'start', sessionId: input.sessionId, model: resolvedModel.model });

  try {
    // Step 4: Get conversation history and call OpenAI with streaming
    const history: Array<{ role: string; content: string }> = await prisma.chatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const messages: ChatCompletionMessage[] = history.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Step 5: Stream the response
    await streamChatCompletion(
      {
        model: resolvedModel.model,
        provider: resolvedModel.provider,
        messages,
      },
      {
        onToken: async (token: string) => {
          await onEvent({ type: 'token', content: token });
        },
        onComplete: async (result: ChatCompletionResult) => {
          // Step 6: Only save assistant response after successful completion
          const assistantMessage = await prisma.chatMessage.create({
            data: {
              sessionId: input.sessionId,
              role: 'assistant',
              model: resolvedModel.id,
              content: result.content,
            },
          });

          // Update session's updatedAt timestamp
          await prisma.chatSession.update({
            where: { id: input.sessionId },
            data: { updatedAt: new Date() },
          });

          await onEvent({
            type: 'complete',
            messageId: assistantMessage.id,
            content: result.content,
          });
        },
        onError: async (error: Error) => {
          await onEvent({ type: 'error', message: error.message });
        },
      }
    );
  } catch (error) {
    // If OpenAI call fails, we still have the user message saved
    // but we DON'T save a fake assistant response - this is correct behavior
    // Re-throw the error so caller can handle it
    throw error;
  }
}
