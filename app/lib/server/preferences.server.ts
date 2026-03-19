import { prisma } from './db.server';

export interface UserChatPreferences {
  chatNetworkEnabled: boolean;
  defaultModelId: string | null;
  personalPrompt: string | null;
}

export interface UserPreferencesInput {
  chatNetworkEnabled?: boolean;
  defaultModelId?: string | null;
  personalPrompt?: string | null;
}

/**
 * Get user chat preferences.
 * Returns default values if no record exists:
 * - chatNetworkEnabled defaults to false
 * - defaultModelId defaults to null
 * - personalPrompt defaults to null
 */
export async function getUserChatPreferences(userId: string): Promise<UserChatPreferences> {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
  });

  return {
    chatNetworkEnabled: preference?.chatNetworkEnabled ?? false,
    defaultModelId: preference?.defaultModelId ?? null,
    personalPrompt: preference?.personalPrompt ?? null,
  };
}

/**
 * Save or update user chat preferences.
 * Uses upsert to create if not exists, update if exists.
 * Partial updates are supported - only provided fields are updated.
 */
export async function saveUserChatPreferences(
  userId: string,
  input: UserPreferencesInput
): Promise<UserChatPreferences> {
  const preference = await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      chatNetworkEnabled: input.chatNetworkEnabled ?? false,
      defaultModelId: input.defaultModelId ?? null,
      personalPrompt: input.personalPrompt ?? null,
    },
    update: {
      ...(input.chatNetworkEnabled !== undefined && { chatNetworkEnabled: input.chatNetworkEnabled }),
      ...(input.defaultModelId !== undefined && { defaultModelId: input.defaultModelId }),
      ...(input.personalPrompt !== undefined && { personalPrompt: input.personalPrompt }),
    },
  });

  return {
    chatNetworkEnabled: preference.chatNetworkEnabled,
    defaultModelId: preference.defaultModelId,
    personalPrompt: preference.personalPrompt,
  };
}
