import { Prisma } from '@prisma/client';
import { prisma } from './db.server';
import {
  sendChatCompletion,
  streamChatCompletion,
  type ChatCompletionMessage,
  type ChatCompletionResult,
  type ChatCompletionOptions,
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
  reasoning?: string | null;
  followUpQuestions?: string[] | null;
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
    const assistantMessage = await prisma.$transaction(async (tx) => {
      const createdAssistantMessage = await tx.chatMessage.create({
        data: {
          sessionId: input.sessionId,
          role: 'assistant',
          model: resolvedModel.id,
          content: completion.content,
        },
      });

      await tx.chatMessage.updateMany({
        where: {
          sessionId: input.sessionId,
          role: 'assistant',
          id: { not: createdAssistantMessage.id },
          followUpQuestions: {
            not: Prisma.DbNull,
          },
        },
        data: {
          followUpQuestions: Prisma.DbNull,
        },
      });

      await tx.chatSession.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      });

      return createdAssistantMessage;
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
 *
 * Event sequence contract:
 * start -> zero or more (reasoning | token) -> complete -> zero or one suggestions
 * error can terminate at any point on failure paths
 */
export type SSEEvent =
  | { type: 'start'; sessionId: string; model: string }
  | { type: 'token'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'complete'; messageId: string; content: string }
  | { type: 'suggestions'; messageId: string; questions: string[] }
  | { type: 'error'; message: string };

/**
 * System prompt for generating follow-up questions
 */
const FOLLOWUP_GENERATION_PROMPT = `Based on the conversation history and the assistant's last response, generate 5 relevant follow-up questions that the user might want to ask next.

Requirements:
- Questions should be concise (max 100 characters each)
- Questions should naturally continue the conversation flow
- Questions should be from the user's perspective
- Format: Return ONLY a JSON array of 5 strings, no markdown, no explanation
- Example: ["Can you explain that in more detail?", "What are the alternatives?", "How does this compare to X?", "What are the potential risks?", "Can you provide an example?"]

Conversation context:`;

/**
 * Parse follow-up questions from model response
 * Best effort parsing - returns empty array on failure (silent fallback)
 */
function parseFollowUpQuestions(content: string): string[] {
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed)) {
      // Filter to valid strings, limit to 5, clean up
      return parsed
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, 5)
        .map(q => q.trim());
    }
  } catch {
    // Silent fallback - parsing failed
  }
  return [];
}

/**
 * Generate follow-up questions based on conversation context
 * This is a best-effort operation - failures are silently ignored
 */
async function generateFollowUpQuestions(
  modelConfig: { model: string; provider: ChatCompletionOptions['provider'] },
  conversationHistory: ChatCompletionMessage[],
  assistantResponse: string
): Promise<string[]> {
  try {
    // Build context for follow-up generation
    const contextMessages: ChatCompletionMessage[] = [
      ...conversationHistory,
      {
        role: 'assistant',
        content: assistantResponse,
      },
      {
        role: 'user',
        content: FOLLOWUP_GENERATION_PROMPT,
      },
    ];

    const result = await sendChatCompletion({
      model: modelConfig.model,
      provider: modelConfig.provider,
      messages: contextMessages,
      temperature: 1,
      maxTokens: 500,
    });

    return parseFollowUpQuestions(result.content);
  } catch (error) {
    // Silent fallback - follow-up generation should not affect main flow
    console.warn('Follow-up questions generation failed:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

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
        onReasoning: async (content: string) => {
          // Forward reasoning chunks to client for live display
          await onEvent({ type: 'reasoning', content });
        },
        onComplete: async (result: ChatCompletionResult) => {
          // Step 6: Only save assistant response after successful completion
          // Include reasoning if present (best effort - may be undefined for non-reasoning models)
          const assistantMessage = await prisma.$transaction(async (tx) => {
            const createdAssistantMessage = await tx.chatMessage.create({
              data: {
                sessionId: input.sessionId,
                role: 'assistant',
                model: resolvedModel.id,
                content: result.content,
                reasoning: result.reasoning || null,
              },
            });

            await tx.chatMessage.updateMany({
              where: {
                sessionId: input.sessionId,
                role: 'assistant',
                id: { not: createdAssistantMessage.id },
                followUpQuestions: {
                  not: Prisma.DbNull,
                },
              },
              data: {
                followUpQuestions: Prisma.DbNull,
              },
            });

            await tx.chatSession.update({
              where: { id: input.sessionId },
              data: { updatedAt: new Date() },
            });

            return createdAssistantMessage;
          });

          await onEvent({
            type: 'complete',
            messageId: assistantMessage.id,
            content: result.content,
          });

          // Step 7: Generate follow-up questions (best effort, non-blocking)
          // This runs after complete event to not delay the main response
          try {
            const followUpQuestions = await generateFollowUpQuestions(
              { model: resolvedModel.model, provider: resolvedModel.provider },
              messages,
              result.content
            );

            if (followUpQuestions.length > 0) {
              // Persist follow-up questions to database
              await prisma.chatMessage.update({
                where: { id: assistantMessage.id },
                data: { followUpQuestions },
              });

              // Send suggestions event to client
              await onEvent({
                type: 'suggestions',
                messageId: assistantMessage.id,
                questions: followUpQuestions,
              });
            }
          } catch (suggestionError) {
            // Silent fallback - suggestions failure should not affect main flow
            console.warn('Failed to generate or save follow-up questions:',
              suggestionError instanceof Error ? suggestionError.message : 'Unknown error');
          }
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
