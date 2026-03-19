import type { Route } from "./+types/user.memories.summary";
import { getSession } from "~/sessions";
import { getMemoriesByIds } from "~/lib/server/user-memory.server";
import {
  getAvailableModelOptions,
  resolveModelReference,
  getSystemConfig,
  type OpenAIProviderConfig,
} from "~/lib/server/config.server";
import { getUserChatPreferences } from "~/lib/server/preferences.server";
import { sendChatCompletion } from "~/lib/server/openai.server";

/**
 * API endpoint for generating AI summary from selected memories.
 * POST /api/user/memories/summary
 * Body: { memoryIds: string[] }
 * Response: { memory: UserMemory } on success, { error: string } on failure
 */

type GenerateSummaryPayload = {
  memoryIds?: unknown;
};

class BadRequestError extends Error {}

function validatePayload(body: GenerateSummaryPayload): string[] {
  if (!body.memoryIds || !Array.isArray(body.memoryIds)) {
    throw new BadRequestError("memoryIds is required and must be an array");
  }

  const memoryIds = body.memoryIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );

  if (memoryIds.length === 0) {
    throw new BadRequestError("At least one memory ID is required");
  }

  return [...new Set(memoryIds)];
}

/**
 * Resolve the model to use for summary generation.
 * Uses user's default model if valid, falls back to first available.
 */
async function resolveUserModel(userId: string): Promise<{
  model: string;
  provider: OpenAIProviderConfig;
} | null> {
  const [availableModels, preferences, systemConfig] = await Promise.all([
    getAvailableModelOptions(),
    getUserChatPreferences(userId),
    getSystemConfig(),
  ]);

  if (availableModels.length === 0 || !systemConfig) {
    return null;
  }

  // Try user's default model first
  if (preferences.defaultModelId) {
    const resolved = await resolveModelReference(preferences.defaultModelId);
    if (resolved) {
      return {
        model: resolved.model,
        provider: resolved.provider,
      };
    }
  }

  // Fallback to first available model
  const firstModel = availableModels[0];
  if (!firstModel) {
    return null;
  }

  const provider = systemConfig.providers.find(
    (p) => p.id === firstModel.providerId
  );
  if (!provider) {
    return null;
  }

  return {
    model: firstModel.model,
    provider,
  };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    let raw: GenerateSummaryPayload;
    try {
      raw = (await request.json()) as GenerateSummaryPayload;
    } catch {
      throw new BadRequestError("Invalid JSON payload");
    }

    const memoryIds = validatePayload(raw);

    // Verify all memories exist and belong to the user
    const memories = await getMemoriesByIds(memoryIds, user.userId);
    if (memories.length !== memoryIds.length) {
      const foundIds = new Set(memories.map((m) => m.id));
      const missingIds = memoryIds.filter((id) => !foundIds.has(id));
      return new Response(
        JSON.stringify({
          error: `Invalid memory IDs: ${missingIds.join(", ")}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Resolve model first to get full provider config
    const modelConfig = await resolveUserModel(user.userId);
    if (!modelConfig) {
      return new Response(
        JSON.stringify({ error: "No model available for summary generation" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build the summarization prompt
    const memoriesText = memories
      .map((memory, index) => `${index + 1}. ${memory.content}`)
      .join("\n\n");

    const messages = [
      {
        role: "system" as const,
        content:
          "You are a helpful assistant that creates concise summaries of user memories. " +
          "Analyze the provided memories and create a single, coherent summary that captures: " +
          "the user's language habits, preferences, and working style. " +
          "Write in third person, be concise (2-3 sentences), and focus on actionable patterns. " +
          "Output only the summary text without explanations or markdown.",
      },
      {
        role: "user" as const,
        content: `Please summarize these user memories into a concise long-term memory:\n\n${memoriesText}`,
      },
    ];

    // Call model for summary generation
    const completionResult = await sendChatCompletion({
      model: modelConfig.model,
      provider: modelConfig.provider,
      messages,
      maxTokens: 500,
    });

    const summaryContent = completionResult.content?.trim();
    if (!summaryContent) {
      return new Response(
        JSON.stringify({ error: "Model returned empty summary" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create the new memory with ai_summary source
    const { createUserMemory } = await import("~/lib/server/user-memory.server");
    const memory = await createUserMemory(user.userId, {
      content: summaryContent,
      source: "ai_summary",
    });

    return new Response(JSON.stringify({ memory }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const status = error instanceof BadRequestError ? 400 : 500;

    const message = error instanceof Error ? error.message : "Operation failed";
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
