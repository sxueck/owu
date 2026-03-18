import OpenAI from "openai";
import type { OpenAIProviderConfig } from "./config.server";
import { getProviderApiBaseUrl, getProviderModelsInfoUrl, getSystemConfig } from "./config.server";

export interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolResultMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantMessageWithToolCalls {
  role: "assistant";
  content: string | null;
  tool_calls: AssistantToolCall[];
  reasoning_content?: string;
  reasoning?: string;
  thinking?: string;
}

export interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionOptions {
  model: string;
  provider: OpenAIProviderConfig;
  messages: (ChatCompletionMessage | ToolResultMessage)[];
  maxTokens?: number;
  tools?: ChatCompletionTool[];
  toolChoice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
  thinking?: { type: "enabled" | "disabled" };
}

type ChatCompletionRequestWithThinking = (
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
) & {
  thinking?: { type: "enabled" | "disabled" };
};

export interface ChatCompletionResult {
  content: string;
  model: string;
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FetchProviderModelsInput {
  apiKey: string;
  baseUrl?: string | null;
}

function createOpenAIClient(provider: OpenAIProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: getProviderApiBaseUrl(provider.baseUrl),
  });
}

function extractModelIds(payload: unknown): string[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] } | null)?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { models?: unknown[] } | null)?.models)
        ? (payload as { models: unknown[] }).models
        : Array.isArray((payload as { data?: { models?: unknown[] } } | null)?.data?.models)
          ? (payload as { data: { models: unknown[] } }).data.models
          : [];

  const modelIds = source
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        return [record.id, record.name, record.model].find((value): value is string => typeof value === "string");
      }

      return null;
    })
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(modelIds)];
}

async function fetchModelsFromUrl(url: string, apiKey: string): Promise<string[]> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const models = extractModelIds(payload);
  if (models.length === 0) {
    throw new Error("No models were returned by the provider.");
  }

  return models;
}

export async function fetchProviderModels(input: FetchProviderModelsInput): Promise<string[]> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error("API key is required to fetch models.");
  }

  const modelsInfoUrl = getProviderModelsInfoUrl(input.baseUrl);

  try {
    return await fetchModelsFromUrl(modelsInfoUrl, apiKey);
  } catch (error) {
    const fallbackUrl = `${getProviderApiBaseUrl(input.baseUrl)}/models`;
    if (fallbackUrl === modelsInfoUrl) {
      throw error;
    }

    return fetchModelsFromUrl(fallbackUrl, apiKey);
  }
}

export interface ChatCompletionWithToolCallsResult {
  content: string | null;
  reasoning?: string;
  toolCalls: AssistantToolCall[];
  toolCallSource: "native" | "content" | "none";
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

type ParsedToolCall = {
  name: string;
  arguments: Record<string, string>;
};

function extractToolCallsFromPattern(
  content: string,
  invokePattern: RegExp,
  parameterPattern: RegExp,
): ParsedToolCall[] {
  const parsedCalls: ParsedToolCall[] = [];

  for (const invokeMatch of content.matchAll(invokePattern)) {
    const functionName = invokeMatch[1]?.trim();
    const body = invokeMatch[2] ?? "";

    if (!functionName) {
      continue;
    }

    const args: Record<string, string> = {};
    for (const parameterMatch of body.matchAll(parameterPattern)) {
      const key = parameterMatch[1]?.trim();
      const value = parameterMatch[2]?.trim();
      if (key && value) {
        args[key] = value;
      }
    }

    parsedCalls.push({
      name: functionName,
      arguments: args,
    });
  }

  return parsedCalls;
}

function parseToolCallsFromContent(content: string | null): AssistantToolCall[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const dsmlInvokePattern = /<[|\uFF5C]DSML[|\uFF5C]invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/[|\uFF5C]DSML[|\uFF5C]invoke>/gi;
  const dsmlParameterPattern = /<[|\uFF5C]DSML[|\uFF5C]parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[|\uFF5C]DSML[|\uFF5C]parameter>/gi;
  const xmlInvokePattern = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/gi;
  const xmlParameterPattern = /<parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;

  const dsmlCalls = extractToolCallsFromPattern(content, dsmlInvokePattern, dsmlParameterPattern);
  const genericCalls = extractToolCallsFromPattern(content, xmlInvokePattern, xmlParameterPattern);
  const combinedCalls = [...dsmlCalls, ...genericCalls];

  return combinedCalls.map((call, index) => ({
    id: `content-tool-call-${index + 1}`,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments),
    },
  }));
}

export async function sendChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const client = createOpenAIClient(options.provider);

  try {
    const requestBody: ChatCompletionRequestWithThinking = {
      model: options.model,
      messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens,
      tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
      tool_choice: options.toolChoice,
    };

    // Add thinking mode parameter for supported models (Kimi K2.5)
    if (options.thinking) {
      requestBody.thinking = options.thinking;
    }

    const response = await client.chat.completions.create(
      requestBody as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error("Empty response from OpenAI");
    }

    return {
      content: choice.message.content || "",
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }

    if (error instanceof Error) {
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }

    throw new Error("Failed to get response from AI: Unknown error");
  }
}

/**
 * Send a chat completion request and return full response including any tool calls.
 * This is used for the first call in a tool-calling flow to discover if the model
 * wants to invoke any tools.
 */
export async function sendChatCompletionWithToolCalls(
  options: ChatCompletionOptions
): Promise<ChatCompletionWithToolCallsResult> {
  const client = createOpenAIClient(options.provider);

  try {
    const requestBody: ChatCompletionRequestWithThinking = {
      model: options.model,
      messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens,
      tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
      tool_choice: options.toolChoice,
    };

    // Add thinking mode parameter for supported models (Kimi K2.5)
    if (options.thinking) {
      requestBody.thinking = options.thinking;
    }

    const response = await client.chat.completions.create(
      requestBody as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error("Empty response from OpenAI");
    }

    const message = choice.message;

    // Extract tool calls if present
    let toolCalls: AssistantToolCall[] = [];
    let toolCallSource: ChatCompletionWithToolCallsResult["toolCallSource"] = "none";
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.type === "function" && tc.function) {
          toolCalls.push({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        toolCallSource = "native";
      }
    }

    if (toolCalls.length === 0) {
      toolCalls = parseToolCallsFromContent(message.content);
      if (toolCalls.length > 0) {
        toolCallSource = "content";
      }
    }

    // Extract reasoning if available (from provider-specific fields)
    let reasoning: string | undefined;
    const msgWithReasoning = message as unknown as Record<string, unknown>;
    if (typeof msgWithReasoning.reasoning_content === "string") {
      reasoning = msgWithReasoning.reasoning_content;
    } else if (typeof msgWithReasoning.thinking === "string") {
      reasoning = msgWithReasoning.thinking;
    } else if (typeof msgWithReasoning.reasoning === "string") {
      reasoning = msgWithReasoning.reasoning;
    }

    return {
      content: message.content,
      reasoning,
      toolCalls,
      toolCallSource,
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }

    if (error instanceof Error) {
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }

    throw new Error("Failed to get response from AI: Unknown error");
  }
}

/**
 * Safely extract reasoning content from delta object.
 * Supports various provider formats in a best-effort manner.
 * Returns null if no reasoning content found (silent fallback).
 */
function extractReasoningFromDelta(delta: unknown): string | null {
  if (!delta || typeof delta !== "object") {
    return null;
  }

  const d = delta as Record<string, unknown>;

  // Check common reasoning field names across providers
  const reasoningFields = ["reasoning_content", "thinking", "reasoning"];

  for (const field of reasoningFields) {
    const value = d[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export async function streamChatCompletion(
  options: ChatCompletionOptions,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onReasoning?: (content: string) => void | Promise<void>;
    onComplete: (result: ChatCompletionResult) => void | Promise<void>;
    onError: (error: Error) => void | Promise<void>;
  },
): Promise<void> {
  const client = createOpenAIClient(options.provider);

  try {
    const requestBody: ChatCompletionRequestWithThinking = {
      model: options.model,
      messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
      tool_choice: options.toolChoice,
    };

    // Add thinking mode parameter for supported models
    if (options.thinking) {
      requestBody.thinking = options.thinking;
    }

    const stream = await client.chat.completions.create(
      requestBody as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    );

    let fullContent = "";
    let fullReasoning = "";
    let model = options.model;
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle main content tokens
      if (delta?.content) {
        const token = delta.content;
        fullContent += token;
        await callbacks.onToken(token);
      }

      // Handle reasoning tokens (best effort - silent fallback if not present)
      const reasoningContent = extractReasoningFromDelta(delta);
      if (reasoningContent && callbacks.onReasoning) {
        fullReasoning += reasoningContent;
        await callbacks.onReasoning(reasoningContent);
      }

      if (chunk.model) {
        model = chunk.model;
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    await callbacks.onComplete({
      content: fullContent,
      model,
      reasoning: fullReasoning.length > 0 ? fullReasoning : undefined,
      usage:
        promptTokens > 0 || completionTokens > 0
          ? {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            }
          : undefined,
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      const apiError = new Error(`OpenAI API Error: ${error.message}`);
      await callbacks.onError(apiError);
      throw apiError;
    }

    const resolvedError =
      error instanceof Error ? error : new Error("Failed to get response from AI: Unknown error");
    await callbacks.onError(resolvedError);
    throw resolvedError;
  }
}

export async function testOpenAIConnection(input?: FetchProviderModelsInput): Promise<{
  success: boolean;
  message: string;
}> {
  const config = await getSystemConfig();
  const provider = input
    ? {
        id: "test-provider",
        label: "Test Provider",
        apiKey: input.apiKey,
        baseUrl: input.baseUrl ?? null,
        models: [],
      }
    : config?.providers[0];

  if (!provider || !provider.apiKey) {
    return {
      success: false,
      message: "OpenAI API key is not configured",
    };
  }

  try {
    const client = createOpenAIClient(provider);
    const response = await client.models.list();

    return {
      success: true,
      message: `Connected successfully. Available models: ${response.data.length}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Connection failed: ${message}`,
    };
  }
}
