import type { Prisma } from "@prisma/client";
import { prisma } from "./db.server";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MULTI_PROVIDER_CONFIG_VERSION = 2;
const MODEL_REF_SEPARATOR = "::";
const LEGACY_PROVIDER_ID = "primary";

export interface OpenAIProviderConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string | null;
  models: string[];
}

export interface PublicOpenAIProviderConfig {
  id: string;
  label: string;
  hasApiKey: boolean;
  baseUrl: string | null;
  models: string[];
}

export interface ModelOption {
  id: string;
  model: string;
  providerId: string;
  providerLabel: string;
  label: string;
}

export interface ResolvedModelReference extends ModelOption {
  provider: OpenAIProviderConfig;
}

export interface SystemConfigData {
  id: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string | null;
  allowedModels: string[];
  providers: OpenAIProviderConfig[];
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PublicConfigData {
  id: string;
  hasApiKey: boolean;
  openaiBaseUrl: string | null;
  allowedModels: string[];
  providers: PublicOpenAIProviderConfig[];
  providerCount: number;
  modelCount: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface ProviderDraftInput {
  id?: string;
  label?: string;
  apiKey?: string;
  baseUrl?: string | null;
  models?: string[];
  retainStoredApiKey?: boolean;
}

type StoredProviderRecord = {
  id?: unknown;
  label?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
  models?: unknown;
};

type StoredProvidersEnvelope = {
  version: number;
  providers: StoredProviderRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl?: string | null): string | null {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

function ensureOpenAIV1BaseUrl(baseUrl?: string | null): string {
  const fallback = normalizeBaseUrl(baseUrl) ?? DEFAULT_OPENAI_BASE_URL;

  try {
    const url = new URL(fallback);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (!pathname || pathname === "/") {
      url.pathname = "/v1";
    } else if (!pathname.endsWith("/v1")) {
      url.pathname = `${pathname}/v1`;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function normalizeProviderLabel(label: string | undefined, index: number): string {
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Provider ${index + 1}`;
}

function normalizeProviderId(id: string | undefined, index: number): string {
  const sanitized = (id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || `provider-${index + 1}`;
}

function ensureUniqueProviderId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return normalizeAllowedModels(values.filter((value): value is string => typeof value === "string"));
}

function normalizeProviderRecord(record: StoredProviderRecord, index: number): OpenAIProviderConfig | null {
  const baseUrl = normalizeBaseUrl(typeof record.baseUrl === "string" ? record.baseUrl : null);
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const models = normalizeStringArray(record.models);

  if (!apiKey && models.length === 0 && !baseUrl) {
    return null;
  }

  return {
    id: normalizeProviderId(typeof record.id === "string" ? record.id : undefined, index),
    label: normalizeProviderLabel(typeof record.label === "string" ? record.label : undefined, index),
    apiKey,
    baseUrl,
    models,
  };
}

function parseStoredProviders(
  rawAllowedModels: unknown,
  legacyApiKey: string | null,
  legacyBaseUrl: string | null,
): OpenAIProviderConfig[] {
  const usedIds = new Set<string>();

  if (isRecord(rawAllowedModels) && Array.isArray(rawAllowedModels.providers)) {
    return rawAllowedModels.providers
      .map((provider, index) => {
        if (!isRecord(provider)) {
          return null;
        }

        const normalized = normalizeProviderRecord(provider, index);
        if (!normalized) {
          return null;
        }

        return {
          ...normalized,
          id: ensureUniqueProviderId(normalized.id, usedIds),
        };
      })
      .filter((provider): provider is OpenAIProviderConfig => provider !== null);
  }

  if (Array.isArray(rawAllowedModels) && rawAllowedModels.some((value) => isRecord(value))) {
    return rawAllowedModels
      .map((provider, index) => {
        if (!isRecord(provider)) {
          return null;
        }

        const normalized = normalizeProviderRecord(provider, index);
        if (!normalized) {
          return null;
        }

        return {
          ...normalized,
          id: ensureUniqueProviderId(normalized.id, usedIds),
        };
      })
      .filter((provider): provider is OpenAIProviderConfig => provider !== null);
  }

  const legacyModels = normalizeStringArray(rawAllowedModels);
  const legacyKey = legacyApiKey?.trim() ?? "";
  const legacyUrl = normalizeBaseUrl(legacyBaseUrl);

  if (!legacyKey && legacyModels.length === 0 && !legacyUrl) {
    return [];
  }

  return [
    {
      id: LEGACY_PROVIDER_ID,
      label: "Primary Provider",
      apiKey: legacyKey,
      baseUrl: legacyUrl,
      models: legacyModels,
    },
  ];
}

function serializeProviders(providers: OpenAIProviderConfig[]): Prisma.InputJsonValue {
  const payload: StoredProvidersEnvelope = {
    version: MULTI_PROVIDER_CONFIG_VERSION,
    providers: providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      models: provider.models,
    })),
  };

  return payload as Prisma.InputJsonObject;
}

function buildModelOptions(providers: OpenAIProviderConfig[]): ModelOption[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      id: composeModelRef(provider.id, model),
      model,
      providerId: provider.id,
      providerLabel: provider.label,
      label: model,
    })),
  );
}

function normalizeProviderModels(models?: string[]): string[] {
  return normalizeAllowedModels(models ?? []);
}

export function normalizeAllowedModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))];
}

export function parseModelsInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

export function formatModelsForDisplay(models: string[]): string {
  return models.join("\n");
}

export function getProviderApiBaseUrl(baseUrl?: string | null): string {
  return ensureOpenAIV1BaseUrl(baseUrl);
}

export function getProviderModelsInfoUrl(baseUrl?: string | null): string {
  return `${ensureOpenAIV1BaseUrl(baseUrl)}/models/info`;
}

export function composeModelRef(providerId: string, model: string): string {
  return `${providerId}${MODEL_REF_SEPARATOR}${model}`;
}

export function parseModelRef(modelRef: string): { providerId: string; model: string } | null {
  const separatorIndex = modelRef.indexOf(MODEL_REF_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }

  const providerId = modelRef.slice(0, separatorIndex).trim();
  const model = modelRef.slice(separatorIndex + MODEL_REF_SEPARATOR.length).trim();

  if (!providerId || !model) {
    return null;
  }

  return { providerId, model };
}

export function normalizeProviderDrafts(
  drafts: ProviderDraftInput[],
  existingProviders: OpenAIProviderConfig[] = [],
): OpenAIProviderConfig[] {
  const existingById = new Map(existingProviders.map((provider) => [provider.id, provider]));
  const usedIds = new Set<string>();

  return drafts
    .map((draft, index) => {
      const baseId = normalizeProviderId(draft.id, index);
      const id = ensureUniqueProviderId(baseId, usedIds);
      const existing = existingById.get(baseId) ?? existingById.get(id);
      const explicitApiKey = draft.apiKey?.trim() ?? "";
      const apiKey = explicitApiKey || (draft.retainStoredApiKey ? existing?.apiKey ?? "" : "");

      return {
        id,
        label: normalizeProviderLabel(draft.label, index),
        apiKey,
        baseUrl: normalizeBaseUrl(draft.baseUrl),
        models: normalizeProviderModels(draft.models),
      };
    })
    .filter((provider) => provider.apiKey || provider.models.length > 0 || provider.baseUrl);
}

export function resolveModelReferenceFromProviders(
  modelRef: string,
  providers: OpenAIProviderConfig[],
): ResolvedModelReference | null {
  const parsedRef = parseModelRef(modelRef);

  if (parsedRef) {
    const provider = providers.find((item) => item.id === parsedRef.providerId);
    if (!provider || !provider.models.includes(parsedRef.model)) {
      return null;
    }

    return {
      id: composeModelRef(provider.id, parsedRef.model),
      model: parsedRef.model,
      providerId: provider.id,
      providerLabel: provider.label,
      label: parsedRef.model,
      provider,
    };
  }

  const provider = providers.find((item) => item.models.includes(modelRef));
  if (!provider) {
    return null;
  }

  return {
    id: composeModelRef(provider.id, modelRef),
    model: modelRef,
    providerId: provider.id,
    providerLabel: provider.label,
    label: modelRef,
    provider,
  };
}

export async function getSystemConfig(): Promise<SystemConfigData | null> {
  const config = await prisma.systemConfig.findFirst();
  if (!config) {
    return null;
  }

  const providers = parseStoredProviders(config.allowedModels, config.openaiApiKey, config.openaiBaseUrl);

  return {
    id: config.id,
    openaiApiKey: config.openaiApiKey,
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: buildModelOptions(providers).map((option) => option.id),
    providers,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

export async function getPublicConfig(): Promise<PublicConfigData | null> {
  const config = await getSystemConfig();
  if (!config) {
    return null;
  }

  const publicProviders = config.providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    hasApiKey: provider.apiKey.length > 0,
    baseUrl: provider.baseUrl,
    models: provider.models,
  }));

  return {
    id: config.id,
    hasApiKey: publicProviders.some((provider) => provider.hasApiKey),
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: buildModelOptions(config.providers).map((option) => option.id),
    providers: publicProviders,
    providerCount: publicProviders.length,
    modelCount: publicProviders.reduce((count, provider) => count + provider.models.length, 0),
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

export interface SaveSystemConfigInput {
  providers?: ProviderDraftInput[];
  openaiApiKey?: string;
  openaiBaseUrl?: string | null;
  allowedModels?: string[];
  updatedBy?: string | null;
}

export async function saveSystemConfig(input: SaveSystemConfigInput): Promise<SystemConfigData> {
  const currentConfig = await getSystemConfig();
  const providers = input.providers
    ? normalizeProviderDrafts(input.providers, currentConfig?.providers ?? [])
    : normalizeProviderDrafts(
        [
          {
            id: LEGACY_PROVIDER_ID,
            label: "Primary Provider",
            apiKey: input.openaiApiKey,
            baseUrl: input.openaiBaseUrl,
            models: input.allowedModels,
          },
        ],
        currentConfig?.providers ?? [],
      );

  if (providers.length === 0) {
    throw new Error("At least one provider is required.");
  }

  for (const provider of providers) {
    if (!provider.apiKey) {
      throw new Error(`Provider \"${provider.label}\" is missing an API key.`);
    }

    if (provider.models.length === 0) {
      throw new Error(`Provider \"${provider.label}\" must include at least one model.`);
    }
  }

  const primaryProvider = providers[0];
  const updateData: {
    openaiApiKey: string;
    openaiBaseUrl: string | null;
    allowedModels: Prisma.InputJsonValue;
    updatedBy?: string | null;
  } = {
    openaiApiKey: primaryProvider.apiKey,
    openaiBaseUrl: primaryProvider.baseUrl,
    allowedModels: serializeProviders(providers),
  };

  if (input.updatedBy !== undefined) {
    updateData.updatedBy = input.updatedBy;
  }

  const existing = await prisma.systemConfig.findFirst();

  if (existing) {
    await prisma.systemConfig.update({
      where: { id: existing.id },
      data: updateData,
    });
  } else {
    await prisma.systemConfig.create({
      data: {
        ...updateData,
        updatedBy: updateData.updatedBy ?? null,
      },
    });
  }

  const nextConfig = await getSystemConfig();
  if (!nextConfig) {
    throw new Error("Failed to load saved system configuration.");
  }

  return nextConfig;
}

export async function getAvailableModelOptions(): Promise<ModelOption[]> {
  const config = await getSystemConfig();
  if (!config) {
    return [];
  }

  return buildModelOptions(config.providers);
}

export async function resolveModelReference(modelRef: string): Promise<ResolvedModelReference | null> {
  const config = await getSystemConfig();
  if (!config) {
    return null;
  }

  return resolveModelReferenceFromProviders(modelRef, config.providers);
}

export async function isModelAllowed(modelRef: string): Promise<boolean> {
  return (await resolveModelReference(modelRef)) !== null;
}

export async function isOpenAIConfigured(): Promise<boolean> {
  const config = await getSystemConfig();
  if (!config) {
    return false;
  }

  return config.providers.some((provider) => provider.apiKey.length > 0 && provider.models.length > 0);
}
