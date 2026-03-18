import { prisma } from './db.server';

export interface UserChatPreferences {
  chatNetworkEnabled: boolean;
}

export interface UserPreferencesInput {
  chatNetworkEnabled?: boolean;
}

/**
 * Get user chat preferences.
 * Returns default values if no record exists (chatNetworkEnabled defaults to true).
 */
export async function getUserChatPreferences(userId: string): Promise<UserChatPreferences> {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
  });

  // Default to disabled if no preference record exists
  return {
    chatNetworkEnabled: preference?.chatNetworkEnabled ?? false,
  };
}

/**
 * Save or update user chat preferences.
 * Uses upsert to create if not exists, update if exists.
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
    },
    update: {
      chatNetworkEnabled: input.chatNetworkEnabled,
    },
  });

  return {
    chatNetworkEnabled: preference.chatNetworkEnabled,
  };
}
