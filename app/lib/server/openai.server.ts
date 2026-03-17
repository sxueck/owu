import OpenAI from "openai";
import type { OpenAIProviderConfig } from "./config.server";
import { getProviderApiBaseUrl, getProviderModelsInfoUrl, getSystemConfig } from "./config.server";

export interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  provider: OpenAIProviderConfig;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
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

export async function sendChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const client = createOpenAIClient(options.provider);

  try {
    const response = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });

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

export async function streamChatCompletion(
  options: ChatCompletionOptions,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onComplete: (result: ChatCompletionResult) => void | Promise<void>;
    onError: (error: Error) => void | Promise<void>;
  },
): Promise<void> {
  const client = createOpenAIClient(options.provider);

  try {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    });

    let fullContent = "";
    let model = options.model;
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        const token = delta.content;
        fullContent += token;
        await callbacks.onToken(token);
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
