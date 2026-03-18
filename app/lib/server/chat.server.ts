import { Prisma } from '@prisma/client';
import { prisma } from './db.server';
import {
  sendChatCompletion,
  sendChatCompletionWithToolCalls,
  streamChatCompletion,
  type ChatCompletionMessage,
  type ToolResultMessage,
  type AssistantMessageWithToolCalls,
  type ChatCompletionResult,
  type ChatCompletionOptions,
  type ChatCompletionTool,
} from './openai.server';
import {
  getAvailableModelOptions,
  isOpenAIConfigured,
  resolveModelReference,
  getSystemConfig,
  type SearchConfig,
} from './config.server';
import { assertChatSessionOwnership } from './ownership.server';
import type { SessionData } from './session.server';
import { isExaConfigured, executeExaSearch, formatExaResultsForToolResponse } from './exa.server';
import { getUserChatPreferences } from './preferences.server';

/**
 * Exa search tool definition for OpenAI tool calling
 */
const EXA_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'exa_search',
    description: 'Search the web for up-to-date information. Use this when the user asks about current events, recent news, or any information that may have changed after your training cutoff.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant information.',
        },
      },
      required: ['query'],
    },
  },
};

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
  content?: string;
  model?: string;
  intent?: 'send' | 'edit-last-user' | 'regenerate-last-assistant';
  messageId?: string;
  networkEnabled?: boolean;
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

type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type PendingTurnMutation =
  | {
      intent: 'send';
    }
  | {
      intent: 'edit-last-user';
      userMessageId: string;
      content: string;
      assistantMessageId: string | null;
    }
  | {
      intent: 'regenerate-last-assistant';
      assistantMessageId: string;
    };

function sanitizeSessionTitle(title?: string): string {
  const plainTitle = (title ?? '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return plainTitle || 'New Chat';
}

function toCompletionMessages(history: StoredChatMessage[]): ChatCompletionMessage[] {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function getSessionHistory(sessionId: string): Promise<StoredChatMessage[]> {
  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      role: true,
      content: true,
    },
  });

  return history.map((message) => ({
    id: message.id,
    role: message.role as StoredChatMessage['role'],
    content: message.content,
  }));
}

function resolveLastEditableUserMessage(
  history: StoredChatMessage[],
  expectedMessageId?: string
): { userMessage: StoredChatMessage; assistantMessage: StoredChatMessage | null } {
  const lastMessage = history.at(-1);
  const previousMessage = history.at(-2) ?? null;

  if (!lastMessage) {
    throw new Error('No messages available to edit.');
  }

  if (lastMessage.role === 'user') {
    if (expectedMessageId && lastMessage.id !== expectedMessageId) {
      throw new Error('Only the latest user message can be edited.');
    }

    return { userMessage: lastMessage, assistantMessage: null };
  }

  if (lastMessage.role === 'assistant' && previousMessage?.role === 'user') {
    if (expectedMessageId && previousMessage.id !== expectedMessageId) {
      throw new Error('Only the latest user message can be edited.');
    }

    return { userMessage: previousMessage, assistantMessage: lastMessage };
  }

  throw new Error('Only the latest user message can be edited.');
}

function resolveLastAssistantMessage(
  history: StoredChatMessage[],
  expectedMessageId?: string
): StoredChatMessage {
  const lastMessage = history.at(-1);

  if (!lastMessage || lastMessage.role !== 'assistant') {
    throw new Error('Only the latest assistant message can be regenerated.');
  }

  if (expectedMessageId && lastMessage.id !== expectedMessageId) {
    throw new Error('Only the latest assistant message can be regenerated.');
  }

  return lastMessage;
}

async function prepareStreamHistory(
  sessionId: string,
  input: SendMessageInput
): Promise<{ messages: ChatCompletionMessage[]; pendingMutation: PendingTurnMutation }> {
  const intent = input.intent ?? 'send';

  if (intent === 'send') {
    const content = input.content?.trim();
    if (!content) {
      throw new Error('Message content is required.');
    }

    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'user',
        content,
      },
    });

    const history = await getSessionHistory(sessionId);
    return {
      messages: toCompletionMessages(history),
      pendingMutation: { intent: 'send' },
    };
  }

  const history = await getSessionHistory(sessionId);

  if (intent === 'edit-last-user') {
    const content = input.content?.trim();
    if (!content) {
      throw new Error('Message content is required.');
    }

    const { userMessage, assistantMessage } = resolveLastEditableUserMessage(history, input.messageId);
    const trimmedHistory = assistantMessage ? history.slice(0, -1) : history;
    const nextHistory = trimmedHistory.map((message) =>
      message.id === userMessage.id
        ? { ...message, content }
        : message
    );

    return {
      messages: toCompletionMessages(nextHistory),
      pendingMutation: {
        intent: 'edit-last-user',
        userMessageId: userMessage.id,
        content,
        assistantMessageId: assistantMessage?.id ?? null,
      },
    };
  }

  const assistantMessage = resolveLastAssistantMessage(history, input.messageId);

  return {
    messages: toCompletionMessages(history.slice(0, -1)),
    pendingMutation: {
      intent: 'regenerate-last-assistant',
      assistantMessageId: assistantMessage.id,
    },
  };
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
  if (!input.content || input.content.trim() === '') {
    throw new Error('Message content is required.');
  }

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
  | { type: 'notice'; level: 'info' | 'warning'; message: string }
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
 * Determine if network search should be enabled for this request.
 * Falls back to user preferences if not explicitly provided.
 */
async function resolveNetworkEnabled(
  userId: string,
  inputNetworkEnabled?: boolean
): Promise<boolean> {
  // If explicitly provided in request, use that value
  if (typeof inputNetworkEnabled === 'boolean') {
    return inputNetworkEnabled;
  }
  // Otherwise fall back to user preferences (defaults to true)
  const preferences = await getUserChatPreferences(userId);
  return preferences.chatNetworkEnabled;
}

/**
 * Execute streaming chat completion with optional tool calling support.
 * This is the core streaming logic used by both normal and tool-enabled flows.
 */
async function executeStreamCompletion(
  options: ChatCompletionOptions,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onReasoning?: (content: string) => void | Promise<void>;
    onComplete: (result: ChatCompletionResult) => void | Promise<void>;
    onError: (error: Error) => void | Promise<void>;
  }
): Promise<void> {
  await streamChatCompletion(options, callbacks);
}

/**
 * Send a message in a chat session with streaming response.
 * 
 * Flow:
 * 1. Verify user owns the session
 * 2. Validate OpenAI configuration
 * 3. Determine network/tool calling mode
 * 4. Save user message to database
 * 5. Call OpenAI API with streaming (with or without tools)
 * 6. Handle tool calls if present
 * 7. Stream tokens via onEvent callback
 * 8. Only save assistant response after stream completes successfully
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

  // Step 3: Determine network/tool calling mode
  const networkEnabled = await resolveNetworkEnabled(user.userId, input.networkEnabled);
  const systemConfig = await getSystemConfig();
  const searchConfig = systemConfig?.searchConfig;
  const exaAvailable = searchConfig && isExaConfigured(searchConfig);
  
  // Determine if we should use tool calling
  const useToolCalling = networkEnabled && exaAvailable;
  
  // If network is enabled but Exa is not configured, send a notice and downgrade
  if (networkEnabled && !exaAvailable) {
    await onEvent({ 
      type: 'notice', 
      level: 'warning', 
      message: 'Network search is enabled but not configured. Using normal chat mode.' 
    });
  }

  // Notify stream start
  await onEvent({ type: 'start', sessionId: input.sessionId, model: resolvedModel.model });

  try {
    // Step 4: Mutate the last turn when needed, then rebuild history for the next completion.
    const { messages, pendingMutation } = await prepareStreamHistory(input.sessionId, input);

    // Step 5: Execute the appropriate flow based on tool calling mode
    if (useToolCalling) {
      // Tool-enabled flow with exa_search
      await executeToolCallingFlow(
        input.sessionId,
        resolvedModel,
        messages,
        pendingMutation,
        searchConfig!,
        onEvent
      );
    } else {
      // Normal flow without tools
      await executeNormalFlow(
        input.sessionId,
        resolvedModel,
        messages,
        pendingMutation,
        onEvent
      );
    }
  } catch (error) {
    // If OpenAI call fails, we still have the user message saved
    // but we DON'T save a fake assistant response - this is correct behavior
    // Re-throw the error so caller can handle it
    throw error;
  }
}

/**
 * Execute normal chat flow without tool calling.
 */
async function executeNormalFlow(
  sessionId: string,
  resolvedModel: NonNullable<Awaited<ReturnType<typeof resolveModelReference>>>,
  messages: ChatCompletionMessage[],
  pendingMutation: PendingTurnMutation,
  onEvent: (event: SSEEvent) => void | Promise<void>
): Promise<void> {
  await executeStreamCompletion(
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
        await onEvent({ type: 'reasoning', content });
      },
      onComplete: async (result: ChatCompletionResult) => {
        await finalizeAssistantMessage(
          sessionId,
          resolvedModel,
          pendingMutation,
          result,
          messages,
          onEvent
        );
      },
      onError: async (error: Error) => {
        await onEvent({ type: 'error', message: error.message });
      },
    }
  );
}

/**
 * Execute tool calling flow with exa_search support.
 * 
 * Flow:
 * 1. Make non-streaming call with tools to discover if model wants to use tools
 * 2. If no tool calls, stream the response directly or use the returned content
 * 3. If tool calls exist, execute them and make second call with results
 */
async function executeToolCallingFlow(
  sessionId: string,
  resolvedModel: NonNullable<Awaited<ReturnType<typeof resolveModelReference>>>,
  messages: ChatCompletionMessage[],
  pendingMutation: PendingTurnMutation,
  searchConfig: SearchConfig,
  onEvent: (event: SSEEvent) => void | Promise<void>
): Promise<void> {
  try {
    // First non-streaming call with tools to discover tool_calls
    const firstResponse = await sendChatCompletionWithToolCalls({
      model: resolvedModel.model,
      provider: resolvedModel.provider,
      messages,
      tools: [EXA_SEARCH_TOOL],
    });

    // If no tool calls, stream the final answer directly
    if (!firstResponse.toolCalls || firstResponse.toolCalls.length === 0) {
      // Stream the content from the first response
      if (firstResponse.content) {
        await onEvent({ type: 'token', content: firstResponse.content });
      }
      if (firstResponse.reasoning) {
        await onEvent({ type: 'reasoning', content: firstResponse.reasoning });
      }
      await finalizeAssistantMessage(
        sessionId,
        resolvedModel,
        pendingMutation,
        {
          content: firstResponse.content || '',
          model: firstResponse.model,
          reasoning: firstResponse.reasoning,
          usage: firstResponse.usage,
        },
        messages,
        onEvent
      );
      return;
    }

    // Filter for supported tool calls (only exa_search)
    const supportedToolCalls = firstResponse.toolCalls.filter(
      tc => tc.function.name === 'exa_search'
    );

    // If no supported tool calls, treat as normal response
    if (supportedToolCalls.length === 0) {
      if (firstResponse.content) {
        await onEvent({ type: 'token', content: firstResponse.content });
      }
      if (firstResponse.reasoning) {
        await onEvent({ type: 'reasoning', content: firstResponse.reasoning });
      }
      await finalizeAssistantMessage(
        sessionId,
        resolvedModel,
        pendingMutation,
        {
          content: firstResponse.content || '',
          model: firstResponse.model,
          reasoning: firstResponse.reasoning,
          usage: firstResponse.usage,
        },
        messages,
        onEvent
      );
      return;
    }

    // Execute supported tool calls
    const toolResults: ToolResultMessage[] = [];
    
    for (const toolCall of supportedToolCalls) {
      try {
        const args = JSON.parse(toolCall.function.arguments) as { query: string };
        const searchResponse = await executeExaSearch(args.query, searchConfig);
        const toolResult = formatExaResultsForToolResponse(searchResponse);
        
        toolResults.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
        });
      } catch (toolError) {
        // Tool execution failed - send notice and fall back to normal completion
        const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown error';
        await onEvent({
          type: 'notice',
          level: 'warning',
          message: `Search failed: ${errorMessage}. Continuing with normal response.`,
        });
        
        // Fall back to normal completion without tools
        await executeNormalFlow(sessionId, resolvedModel, messages, pendingMutation, onEvent);
        return;
      }
    }

    // Build messages for second call:
    // - original messages
    // - assistant message with tool_calls (required by OpenAI API)
    // - tool result messages
    const assistantMessageWithToolCalls: AssistantMessageWithToolCalls = {
      role: 'assistant',
      content: firstResponse.content,
      tool_calls: supportedToolCalls,
    };

    const messagesWithTool: (ChatCompletionMessage | ToolResultMessage | AssistantMessageWithToolCalls)[] = [
      ...messages,
      assistantMessageWithToolCalls,
      ...toolResults,
    ];

    // Second streaming completion to get final answer
    await executeStreamCompletion(
      {
        model: resolvedModel.model,
        provider: resolvedModel.provider,
        messages: messagesWithTool as ChatCompletionOptions['messages'],
      },
      {
        onToken: async (token: string) => {
          await onEvent({ type: 'token', content: token });
        },
        onReasoning: async (content: string) => {
          await onEvent({ type: 'reasoning', content });
        },
        onComplete: async (result: ChatCompletionResult) => {
          await finalizeAssistantMessage(
            sessionId,
            resolvedModel,
            pendingMutation,
            result,
            messages,
            onEvent
          );
        },
        onError: async (error: Error) => {
          await onEvent({ type: 'error', message: error.message });
        },
      }
    );
  } catch (error) {
    // If the tool calling flow fails, fall back to normal flow
    await onEvent({
      type: 'notice',
      level: 'warning',
      message: 'Network search encountered an issue. Using normal chat mode.',
    });
    await executeNormalFlow(sessionId, resolvedModel, messages, pendingMutation, onEvent);
  }
}

/**
 * Finalize assistant message: save to database and send complete event.
 */
async function finalizeAssistantMessage(
  sessionId: string,
  resolvedModel: NonNullable<Awaited<ReturnType<typeof resolveModelReference>>>,
  pendingMutation: PendingTurnMutation,
  result: ChatCompletionResult,
  conversationHistory: ChatCompletionMessage[],
  onEvent: (event: SSEEvent) => void | Promise<void>
): Promise<void> {
  // Save assistant response to database
  const assistantMessage = await prisma.$transaction(async (tx) => {
    if (pendingMutation.intent === 'edit-last-user') {
      await tx.chatMessage.update({
        where: { id: pendingMutation.userMessageId },
        data: { content: pendingMutation.content },
      });

      if (pendingMutation.assistantMessageId) {
        await tx.chatMessage.delete({
          where: { id: pendingMutation.assistantMessageId },
        });
      }
    }

    if (pendingMutation.intent === 'regenerate-last-assistant') {
      await tx.chatMessage.delete({
        where: { id: pendingMutation.assistantMessageId },
      });
    }

    const createdAssistantMessage = await tx.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        model: resolvedModel.id,
        content: result.content,
        reasoning: result.reasoning || null,
      },
    });

    await tx.chatMessage.updateMany({
      where: {
        sessionId,
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
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return createdAssistantMessage;
  });

  await onEvent({
    type: 'complete',
    messageId: assistantMessage.id,
    content: result.content,
  });

  // Generate follow-up questions (best effort, non-blocking)
  try {
    const followUpQuestions = await generateFollowUpQuestions(
      { model: resolvedModel.model, provider: resolvedModel.provider },
      conversationHistory,
      result.content
    );

    if (followUpQuestions.length > 0) {
      await prisma.chatMessage.update({
        where: { id: assistantMessage.id },
        data: { followUpQuestions },
      });

      await onEvent({
        type: 'suggestions',
        messageId: assistantMessage.id,
        questions: followUpQuestions,
      });
    }
  } catch (suggestionError) {
    console.warn('Failed to generate or save follow-up questions:',
      suggestionError instanceof Error ? suggestionError.message : 'Unknown error');
  }
}
