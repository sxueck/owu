import type { Prisma } from "@prisma/client";
import { prisma } from "./db.server";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MULTI_PROVIDER_CONFIG_VERSION = 2;
const MCP_CONFIG_VERSION = 1;
const SEARCH_CONFIG_VERSION = 1;
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

// MCP Transport types
export type MCPTransport = "stdio" | "sse" | "streamable-http" | "http";

// MCP Server configuration interface
export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  transport: MCPTransport;
  command: string | null;
  args: string[];
  env: Array<{ key: string; value: string }>;
  url: string | null;
  headers: Array<{ key: string; value: string }>;
  enabled: boolean;
}

// MCP Server configuration for public consumption (admin UI)
export interface PublicMCPServerConfig {
  id: string;
  name: string;
  description: string;
  transport: MCPTransport;
  command: string | null;
  args: string[];
  env: Array<{ key: string; value: string }>;
  url: string | null;
  headers: Array<{ key: string; value: string }>;
  enabled: boolean;
  // Indicates if this server can be used (has required fields for its transport)
  isValid: boolean;
}

// MCP Server draft input for saving
export interface MCPServerDraftInput {
  id?: string;
  name?: string;
  description?: string;
  transport?: MCPTransport;
  command?: string | null;
  args?: string[];
  env?: Array<{ key: string; value: string }>;
  url?: string | null;
  headers?: Array<{ key: string; value: string }>;
  enabled?: boolean;
}

// Search configuration interfaces
export interface SearchConfig {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  defaultResultCount: number;
  isConfigured: boolean;
}

export interface PublicSearchConfig {
  enabled: boolean;
  apiKeyPresent: boolean;
  baseUrl: string | null;
  defaultResultCount: number;
  isConfigured: boolean;
}

export interface SearchConfigInput {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string | null;
  defaultResultCount?: number;
}

export interface SystemConfigData {
  id: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string | null;
  allowedModels: string[];
  providers: OpenAIProviderConfig[];
  mcpServers: MCPServerConfig[];
  searchConfig: SearchConfig;
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
  mcpServers: PublicMCPServerConfig[];
  mcpServerCount: number;
  searchConfig: PublicSearchConfig;
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

type StoredMCPServerRecord = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  transport?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  url?: unknown;
  headers?: unknown;
  enabled?: unknown;
};

type StoredMCPServersEnvelope = {
  version: number;
  servers: StoredMCPServerRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// MCP helper functions

const VALID_MCP_TRANSPORTS: MCPTransport[] = ["stdio", "sse", "streamable-http", "http"];

function isValidMCPTransport(transport: unknown): transport is MCPTransport {
  return typeof transport === "string" && VALID_MCP_TRANSPORTS.includes(transport as MCPTransport);
}

function normalizeMCPServerId(id: string | undefined, index: number): string {
  const sanitized = (id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || `mcp-server-${index + 1}`;
}

function ensureUniqueMCPServerId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizeMCPStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeMCPKeyValueArray(values: unknown): Array<{ key: string; value: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((item): item is { key: string; value: string } => {
      if (!isRecord(item)) return false;
      const key = item.key;
      const value = item.value;
      return typeof key === "string" && typeof value === "string" && key.trim().length > 0;
    })
    .map((item) => ({
      key: item.key.trim(),
      value: item.value,
    }));
}

function validateMCPServer(server: MCPServerConfig): boolean {
  // Check transport-specific requirements
  switch (server.transport) {
    case "stdio":
      return server.command !== null && server.command.trim().length > 0;
    case "sse":
    case "streamable-http":
    case "http":
      return server.url !== null && server.url.trim().length > 0;
    default:
      return false;
  }
}

function normalizeMCPServerRecord(record: StoredMCPServerRecord, index: number): MCPServerConfig | null {
  const transport = isValidMCPTransport(record.transport) ? record.transport : "stdio";

  const server: MCPServerConfig = {
    id: normalizeMCPServerId(typeof record.id === "string" ? record.id : undefined, index),
    name: typeof record.name === "string" ? record.name.trim() : `MCP Server ${index + 1}`,
    description: typeof record.description === "string" ? record.description.trim() : "",
    transport,
    command: typeof record.command === "string" ? record.command.trim() || null : null,
    args: normalizeMCPStringArray(record.args),
    env: normalizeMCPKeyValueArray(record.env),
    url: typeof record.url === "string" ? record.url.trim() || null : null,
    headers: normalizeMCPKeyValueArray(record.headers),
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
  };

  return server;
}

function parseStoredMCPServers(rawMCPServers: unknown): MCPServerConfig[] {
  const usedIds = new Set<string>();

  // Check if it's the new envelope format
  if (isRecord(rawMCPServers) && Array.isArray(rawMCPServers.servers)) {
    return rawMCPServers.servers
      .map((server, index) => {
        if (!isRecord(server)) {
          return null;
        }

        const normalized = normalizeMCPServerRecord(server, index);
        if (!normalized) {
          return null;
        }

        return {
          ...normalized,
          id: ensureUniqueMCPServerId(normalized.id, usedIds),
        };
      })
      .filter((server): server is MCPServerConfig => server !== null);
  }

  // Legacy: plain array format (if someone stored it differently)
  if (Array.isArray(rawMCPServers)) {
    return rawMCPServers
      .map((server, index) => {
        if (!isRecord(server)) {
          return null;
        }

        const normalized = normalizeMCPServerRecord(server, index);
        if (!normalized) {
          return null;
        }

        return {
          ...normalized,
          id: ensureUniqueMCPServerId(normalized.id, usedIds),
        };
      })
      .filter((server): server is MCPServerConfig => server !== null);
  }

  return [];
}

function serializeMCPServers(servers: MCPServerConfig[]): Prisma.InputJsonValue {
  const payload: StoredMCPServersEnvelope = {
    version: MCP_CONFIG_VERSION,
    servers: servers.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      transport: server.transport,
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      headers: server.headers,
      enabled: server.enabled,
    })),
  };

  return payload as Prisma.InputJsonObject;
}

export function normalizeMCPServerDrafts(drafts: MCPServerDraftInput[]): MCPServerConfig[] {
  const usedIds = new Set<string>();

  return drafts
    .map((draft, index) => {
      const baseId = normalizeMCPServerId(draft.id, index);
      const id = ensureUniqueMCPServerId(baseId, usedIds);
      const transport = isValidMCPTransport(draft.transport) ? draft.transport : "stdio";

      return {
        id,
        name: draft.name?.trim() || `MCP Server ${index + 1}`,
        description: draft.description?.trim() || "",
        transport,
        command: draft.command?.trim() || null,
        args: normalizeMCPStringArray(draft.args),
        env: normalizeMCPKeyValueArray(draft.env),
        url: draft.url?.trim() || null,
        headers: normalizeMCPKeyValueArray(draft.headers),
        enabled: typeof draft.enabled === "boolean" ? draft.enabled : true,
      };
    })
    .filter((server) => server.name.length > 0 || server.command || server.url);
}

export function validateMCPServerConfig(server: MCPServerConfig): { valid: boolean; error?: string } {
  if (!server.name || server.name.trim().length === 0) {
    return { valid: false, error: "MCP server name is required" };
  }

  switch (server.transport) {
    case "stdio":
      if (!server.command || server.command.trim().length === 0) {
        return { valid: false, error: `MCP server "${server.name}" requires a command for stdio transport` };
      }
      break;
    case "sse":
    case "streamable-http":
    case "http":
      if (!server.url || server.url.trim().length === 0) {
        return { valid: false, error: `MCP server "${server.name}" requires a URL for ${server.transport} transport` };
      }
      break;
    default:
      return { valid: false, error: `MCP server "${server.name}" has invalid transport type` };
  }

  return { valid: true };
}

// Search config helper types
type StoredSearchConfigEnvelope = {
  version: number;
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  defaultResultCount?: number;
};

const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";
const DEFAULT_RESULT_COUNT = 5;

function normalizeSearchConfig(rawConfig: unknown): SearchConfig {
  if (!isRecord(rawConfig)) {
    return {
      enabled: false,
      apiKey: null,
      baseUrl: null,
      defaultResultCount: DEFAULT_RESULT_COUNT,
      isConfigured: false,
    };
  }

  const envelope = rawConfig as StoredSearchConfigEnvelope;
  const apiKey = typeof envelope.apiKey === "string" ? envelope.apiKey.trim() : "";
  const baseUrl = normalizeBaseUrl(envelope.baseUrl) ?? DEFAULT_EXA_BASE_URL;
  const defaultResultCount = typeof envelope.defaultResultCount === "number"
    ? Math.max(1, Math.min(20, envelope.defaultResultCount))
    : DEFAULT_RESULT_COUNT;

  return {
    enabled: typeof envelope.enabled === "boolean" ? envelope.enabled : false,
    apiKey: apiKey || null,
    baseUrl,
    defaultResultCount,
    isConfigured: apiKey.length > 0,
  };
}

function serializeSearchConfig(config: SearchConfig): Prisma.InputJsonValue {
  const payload: StoredSearchConfigEnvelope = {
    version: SEARCH_CONFIG_VERSION,
    enabled: config.enabled,
    apiKey: config.apiKey ?? undefined,
    baseUrl: config.baseUrl ?? undefined,
    defaultResultCount: config.defaultResultCount,
  };

  return payload as Prisma.InputJsonObject;
}

export function normalizeSearchConfigInput(input: SearchConfigInput, existingApiKey?: string | null): SearchConfig {
  const apiKey = input.apiKey?.trim() ?? existingApiKey ?? "";
  const baseUrl = normalizeBaseUrl(input.baseUrl) ?? DEFAULT_EXA_BASE_URL;
  const defaultResultCount = typeof input.defaultResultCount === "number"
    ? Math.max(1, Math.min(20, input.defaultResultCount))
    : DEFAULT_RESULT_COUNT;

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : false,
    apiKey: apiKey || null,
    baseUrl,
    defaultResultCount,
    isConfigured: apiKey.length > 0,
  };
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
  const mcpServers = parseStoredMCPServers((config as { mcpServers?: unknown }).mcpServers);
  const searchConfig = normalizeSearchConfig((config as { searchConfig?: unknown }).searchConfig);

  return {
    id: config.id,
    openaiApiKey: config.openaiApiKey,
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: buildModelOptions(providers).map((option) => option.id),
    providers,
    mcpServers,
    searchConfig,
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

  const publicMCPServers = config.mcpServers.map((server) => ({
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    headers: server.headers,
    enabled: server.enabled,
    isValid: validateMCPServer(server),
  }));

  return {
    id: config.id,
    hasApiKey: publicProviders.some((provider) => provider.hasApiKey),
    openaiBaseUrl: config.openaiBaseUrl,
    allowedModels: buildModelOptions(config.providers).map((option) => option.id),
    providers: publicProviders,
    providerCount: publicProviders.length,
    modelCount: publicProviders.reduce((count, provider) => count + provider.models.length, 0),
    mcpServers: publicMCPServers,
    mcpServerCount: publicMCPServers.length,
    searchConfig: {
      enabled: config.searchConfig.enabled,
      apiKeyPresent: config.searchConfig.apiKey !== null && config.searchConfig.apiKey.length > 0,
      baseUrl: config.searchConfig.baseUrl,
      defaultResultCount: config.searchConfig.defaultResultCount,
      isConfigured: config.searchConfig.isConfigured,
    },
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

export interface SaveSystemConfigInput {
  providers?: ProviderDraftInput[];
  openaiApiKey?: string;
  openaiBaseUrl?: string | null;
  allowedModels?: string[];
  mcpServers?: MCPServerDraftInput[];
  searchConfig?: SearchConfigInput;
  allowEmptyProviders?: boolean;
  updatedBy?: string | null;
}

export async function saveSystemConfig(input: SaveSystemConfigInput): Promise<SystemConfigData> {
  const currentConfig = await getSystemConfig();
  const shouldUpdateProviders = input.providers !== undefined
    || input.openaiApiKey !== undefined
    || input.openaiBaseUrl !== undefined
    || input.allowedModels !== undefined;
  const providers = input.providers !== undefined
    ? normalizeProviderDrafts(input.providers, currentConfig?.providers ?? [])
    : shouldUpdateProviders
      ? normalizeProviderDrafts(
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
        )
      : currentConfig?.providers ?? [];

  if (providers.length === 0 && !input.allowEmptyProviders) {
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

  // Process MCP servers if provided
  const mcpServers = input.mcpServers !== undefined
    ? normalizeMCPServerDrafts(input.mcpServers)
    : currentConfig?.mcpServers ?? [];

  // Validate MCP servers if any exist
  for (const server of mcpServers) {
    const validation = validateMCPServerConfig(server);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  // Process search config if provided
  const searchConfig = input.searchConfig !== undefined
    ? normalizeSearchConfigInput(input.searchConfig, currentConfig?.searchConfig?.apiKey)
    : currentConfig?.searchConfig ?? {
        enabled: false,
        apiKey: null,
        baseUrl: null,
        defaultResultCount: 5,
        isConfigured: false,
      };

  const primaryProvider = providers[0] ?? null;
  const updateData: {
    openaiApiKey: string | null;
    openaiBaseUrl: string | null;
    allowedModels: Prisma.InputJsonValue;
    mcpServers: Prisma.InputJsonValue;
    searchConfig: Prisma.InputJsonValue;
    updatedBy?: string | null;
  } = {
    openaiApiKey: primaryProvider?.apiKey ?? null,
    openaiBaseUrl: primaryProvider?.baseUrl ?? null,
    allowedModels: serializeProviders(providers),
    mcpServers: serializeMCPServers(mcpServers),
    searchConfig: serializeSearchConfig(searchConfig),
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
