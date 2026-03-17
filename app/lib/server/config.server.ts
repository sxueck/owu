import { prisma } from './db.server';

/**
 * Server-only system configuration access.
 * All OpenAI settings are stored in database and managed via admin panel.
 */

export interface SystemConfigData {
  id: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string | null;
  allowedModels: string[];
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Public-safe configuration data (no API keys)
 * Used for sending config state to the client
 */
export interface PublicConfigData {
  id: string;
  hasApiKey: boolean;
  openaiBaseUrl: string | null;
  allowedModels: string[];
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Get the singleton system configuration.
 * Returns null if not initialized.
 */
export async function getSystemConfig(): Promise<SystemConfigData | null> {
  const config = await prisma.systemConfig.findFirst();
  if (!config) return null;

  return {
    id: config.id,
    openaiApiKey: config.openaiApiKey,
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: (config.allowedModels as unknown as string[]) ?? [],
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

/**
 * Get public-safe configuration (no API keys exposed)
 * Safe to return to the client
 */
export async function getPublicConfig(): Promise<PublicConfigData | null> {
  const config = await getSystemConfig();
  if (!config) return null;

  return {
    id: config.id,
    hasApiKey: !!config.openaiApiKey && config.openaiApiKey.length > 0,
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: config.allowedModels,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

/**
 * Save system configuration.
 * Creates a new record if none exists, otherwise updates the existing one.
 */
export interface SaveSystemConfigInput {
  /** API Key must be explicitly provided and non-empty */
  openaiApiKey: string;
  openaiBaseUrl?: string | null;
  allowedModels?: string[];
  updatedBy?: string | null;
}

export async function saveSystemConfig(input: SaveSystemConfigInput): Promise<SystemConfigData> {
  // Contract: API Key must be explicitly provided and non-empty
  if (!input.openaiApiKey || input.openaiApiKey.trim().length === 0) {
    throw new Error("API Key is required and must be non-empty");
  }

  // Get existing config or create new
  let config = await prisma.systemConfig.findFirst();

  // Normalize allowedModels: trim, deduplicate, filter empty
  const normalizedModels = input.allowedModels
    ? normalizeAllowedModels(input.allowedModels)
    : undefined;

  // Prepare update data - always include API key (explicit contract)
  const updateData: {
    openaiApiKey: string;
    openaiBaseUrl?: string | null;
    allowedModels?: string[];
    updatedBy?: string | null;
  } = {
    openaiApiKey: input.openaiApiKey.trim(),
  };

  if (input.openaiBaseUrl !== undefined) {
    updateData.openaiBaseUrl = input.openaiBaseUrl?.trim() || null;
  }

  if (normalizedModels !== undefined) {
    updateData.allowedModels = normalizedModels as unknown as string;
  }

  if (input.updatedBy !== undefined) {
    updateData.updatedBy = input.updatedBy;
  }

  if (config) {
    // Update existing
    const updated = await prisma.systemConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    return {
      id: updated.id,
      openaiApiKey: updated.openaiApiKey,
      openaiBaseUrl: updated.openaiBaseUrl,
      allowedModels: (updated.allowedModels as unknown as string[]) ?? [],
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };
  } else {
    // Create new with defaults for missing fields
    const created = await prisma.systemConfig.create({
      data: {
        openaiApiKey: updateData.openaiApiKey,
        openaiBaseUrl: updateData.openaiBaseUrl ?? null,
        allowedModels: (updateData.allowedModels as unknown as string[]) ?? [],
        updatedBy: updateData.updatedBy ?? null,
      },
    });

    return {
      id: created.id,
      openaiApiKey: created.openaiApiKey,
      openaiBaseUrl: created.openaiBaseUrl,
      allowedModels: (created.allowedModels as unknown as string[]) ?? [],
      updatedAt: created.updatedAt,
      updatedBy: created.updatedBy,
    };
  }
}

/**
 * Normalize allowed models list:
 * - Trim whitespace
 * - Remove empty items
 * - Deduplicate
 */
export function normalizeAllowedModels(models: string[]): string[] {
  return [...new Set(
    models
      .map(m => m.trim())
      .filter(m => m.length > 0)
  )];
}

/**
 * Parse models from textarea input (newline or comma separated)
 */
export function parseModelsInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map(m => m.trim())
    .filter(m => m.length > 0);
}

/**
 * Format models for textarea display (one per line)
 */
export function formatModelsForDisplay(models: string[]): string {
  return models.join('\n');
}

/**
 * Check if a model is in the allowed list.
 * This function should be called server-side before making OpenAI requests.
 */
export async function isModelAllowed(model: string): Promise<boolean> {
  const config = await getSystemConfig();
  if (!config) return false;
  return config.allowedModels.includes(model);
}

/**
 * Verify OpenAI configuration is complete and usable.
 */
export async function isOpenAIConfigured(): Promise<boolean> {
  const config = await getSystemConfig();
  if (!config) return false;
  return !!config.openaiApiKey && config.allowedModels.length > 0;
}
