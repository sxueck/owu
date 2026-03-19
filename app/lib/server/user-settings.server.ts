import {
  getAvailableModelOptions,
  resolveModelReference,
  isModelAllowed,
  type ModelOption,
} from './config.server';
import { getUserChatPreferences, saveUserChatPreferences, type UserPreferencesInput } from './preferences.server';
import {
  getUserMemories,
  createUserMemory,
  updateUserMemory,
  deleteUserMemory,
  type UserMemory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
} from './user-memory.server';

// Default system prompt to use when user has no custom personal prompt
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. You provide clear, accurate, and concise responses while being friendly and professional. You can help with a wide range of tasks including answering questions, writing, analysis, coding, and problem-solving.`;

/**
 * Model information in the user settings read model
 */
export interface UserSettingsModelInfo {
  id: string;
  label: string;
  providerLabel: string;
}

/**
 * Default model configuration with fallback handling
 */
export interface UserSettingsDefaultModel {
  selectedModelId: string;
  fallbackModelId: string | null;
  isFallback: boolean;
  invalidStoredModelId?: string | null;
}

/**
 * Personal prompt configuration with source tracking
 */
export interface UserSettingsPersonalPrompt {
  value: string;
  source: 'default' | 'custom';
  defaultValue: string;
}

/**
 * Complete user settings read model for UI consumption
 */
export interface UserSettingsReadModel {
  availableModels: UserSettingsModelInfo[];
  defaultModel: UserSettingsDefaultModel | null;
  personalPrompt: UserSettingsPersonalPrompt;
  chatNetworkEnabled: boolean;
  memories: UserMemory[];
}

/**
 * Input for saving default model and personal prompt
 */
export interface SaveUserSettingsInput {
  defaultModelId?: string | null;
  personalPrompt?: string | null;
}

/**
 * Resolve the default model for a user, handling fallback when stored model is invalid.
 * Returns null if no models are available at all.
 */
async function resolveUserDefaultModel(
  userId: string,
  availableModels: ModelOption[]
): Promise<UserSettingsDefaultModel | null> {
  if (availableModels.length === 0) {
    return null;
  }

  const preferences = await getUserChatPreferences(userId);
  const fallbackModelId = availableModels[0]?.id ?? null;

  // No stored preference - use first available as both selected and fallback
  if (!preferences.defaultModelId) {
    return {
      selectedModelId: fallbackModelId,
      fallbackModelId,
      isFallback: false,
    };
  }

  // Check if stored model is still valid
  const storedModelRef = preferences.defaultModelId;
  const isStoredModelValid = availableModels.some((m) => m.id === storedModelRef);

  if (isStoredModelValid) {
    return {
      selectedModelId: storedModelRef,
      fallbackModelId: null,
      isFallback: false,
    };
  }

  // Stored model is invalid - fall back to first available
  return {
    selectedModelId: fallbackModelId,
    fallbackModelId,
    isFallback: true,
    invalidStoredModelId: storedModelRef,
  };
}

/**
 * Build the personal prompt configuration with proper source tracking.
 */
function buildPersonalPromptConfig(storedPrompt: string | null): UserSettingsPersonalPrompt {
  if (storedPrompt && storedPrompt.trim().length > 0) {
    return {
      value: storedPrompt.trim(),
      source: 'custom',
      defaultValue: DEFAULT_SYSTEM_PROMPT,
    };
  }

  return {
    value: DEFAULT_SYSTEM_PROMPT,
    source: 'default',
    defaultValue: DEFAULT_SYSTEM_PROMPT,
  };
}

/**
 * Get the complete user settings read model.
 * This is the primary interface for the settings UI to fetch all data in one call.
 */
export async function getUserSettings(userId: string): Promise<UserSettingsReadModel> {
  const [availableModels, preferences, memories] = await Promise.all([
    getAvailableModelOptions(),
    getUserChatPreferences(userId),
    getUserMemories(userId),
  ]);

  const availableModelsForSettings = availableModels.map((model) => ({
    id: model.id,
    label: model.label,
    providerLabel: model.providerLabel,
  }));

  const defaultModel = await resolveUserDefaultModel(userId, availableModels);
  const personalPrompt = buildPersonalPromptConfig(preferences.personalPrompt);

  return {
    availableModels: availableModelsForSettings,
    defaultModel,
    personalPrompt,
    chatNetworkEnabled: preferences.chatNetworkEnabled,
    memories,
  };
}

/**
 * Save user settings (default model and/or personal prompt).
 * Partial updates are supported - only provided fields are updated.
 *
 * Note: defaultModelId is validated server-side against available models.
 * Invalid model IDs are rejected. Use null to clear/reset the preference.
 */
export async function saveUserSettings(
  userId: string,
  input: SaveUserSettingsInput
): Promise<void> {
  const update: UserPreferencesInput = {};

  if (input.defaultModelId !== undefined) {
    // null is allowed to clear/reset the preference
    if (input.defaultModelId !== null) {
      // Validate against available models
      const isValid = await isModelAllowed(input.defaultModelId);
      if (!isValid) {
        throw new Error(
          `Invalid default model: "${input.defaultModelId}" is not in the allowed models list.`
        );
      }
    }
    update.defaultModelId = input.defaultModelId;
  }

  if (input.personalPrompt !== undefined) {
    // Store empty string as null to indicate "use default"
    update.personalPrompt = input.personalPrompt?.trim() || null;
  }

  // Only save if there's something to update
  if (Object.keys(update).length > 0) {
    await saveUserChatPreferences(userId, update);
  }
}

/**
 * Get the effective system prompt for chat context injection.
 * Returns user's custom prompt if set, otherwise returns default.
 */
export async function getEffectiveSystemPrompt(userId: string): Promise<string> {
  const preferences = await getUserChatPreferences(userId);
  return preferences.personalPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
}

/**
 * Get memories formatted for chat context injection.
 * Returns empty array if user has no memories.
 */
export async function getUserMemoriesForContext(userId: string): Promise<UserMemory[]> {
  return getUserMemories(userId);
}

// Re-export memory operations for convenience
export {
  createUserMemory,
  updateUserMemory,
  deleteUserMemory,
  type UserMemory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
};
