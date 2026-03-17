import OpenAI from 'openai';
import { getSystemConfig } from './config.server';

/**
 * Server-only OpenAI provider service.
 * All OpenAI API calls must go through this service for proper configuration and validation.
 */

export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
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

/**
 * Create an OpenAI client with current system configuration.
 * Returns null if OpenAI is not configured.
 */
async function createOpenAIClient(): Promise<OpenAI | null> {
  const config = await getSystemConfig();
  if (!config || !config.openaiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl || undefined,
  });
}

/**
 * Send a chat completion request to OpenAI.
 * 
 * Pre-conditions (must be checked by caller):
 * - User is authenticated
 * - Model is in allowed list
 * - OpenAI configuration is complete
 * 
 * @throws Error if OpenAI is not configured or request fails
 */
export async function sendChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const client = await createOpenAIClient();
  if (!client) {
    throw new Error('OpenAI is not configured. Please contact administrator.');
  }

  try {
    const response = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      content: choice.message.content || '',
      model: response.model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  } catch (error) {
    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
    
    // Handle other errors
    if (error instanceof Error) {
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }
    
    throw new Error('Failed to get response from AI: Unknown error');
  }
}

/**
 * Send a chat completion request with streaming response.
 * 
 * Pre-conditions (must be checked by caller):
 * - User is authenticated
 * - Model is in allowed list
 * - OpenAI configuration is complete
 * 
 * @param options - Chat completion options
 * @param onToken - Callback for each token received
 * @param onComplete - Callback when stream completes
 * @param onError - Callback when error occurs
 */
export async function streamChatCompletion(
  options: ChatCompletionOptions,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onComplete: (result: ChatCompletionResult) => void | Promise<void>;
    onError: (error: Error) => void | Promise<void>;
  }
): Promise<void> {
  const client = await createOpenAIClient();
  if (!client) {
    throw new Error('OpenAI is not configured. Please contact administrator.');
  }

  try {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    });

    let fullContent = '';
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

      // Capture model from the first chunk
      if (chunk.model) {
        model = chunk.model;
      }

      // Track usage if available
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    const result: ChatCompletionResult = {
      content: fullContent,
      model,
      usage: promptTokens > 0 || completionTokens > 0
        ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          }
        : undefined,
    };

    await callbacks.onComplete(result);
  } catch (error) {
    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      const apiError = new Error(`OpenAI API Error: ${error.message}`);
      await callbacks.onError(apiError);
      throw apiError;
    }
    
    // Handle other errors
    const err = error instanceof Error
      ? error
      : new Error('Failed to get response from AI: Unknown error');
    await callbacks.onError(err);
    throw err;
  }
}

/**
 * Test OpenAI connection with current configuration.
 * Returns success status and error message if failed.
 */
export async function testOpenAIConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  const config = await getSystemConfig();
  if (!config || !config.openaiApiKey) {
    return {
      success: false,
      message: 'OpenAI API key is not configured',
    };
  }

  try {
    const client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl || undefined,
    });

    // Make a minimal request to test connection
    const response = await client.models.list();
    
    return {
      success: true,
      message: `Connected successfully. Available models: ${response.data.length}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Connection failed: ${message}`,
    };
  }
}
