// Server-only module exports
// All exports from this directory are server-only and safe to access secrets

// Database
export { prisma } from './db.server';

// Environment
export { env } from './env.server';

// System Configuration
export {
  getSystemConfig,
  getPublicConfig,
  saveSystemConfig,
  normalizeAllowedModels,
  parseModelsInput,
  formatModelsForDisplay,
  isModelAllowed,
  isOpenAIConfigured,
} from './config.server';
export type { SystemConfigData, PublicConfigData, SaveSystemConfigInput } from './config.server';

// Session Management
export {
  createUserSession,
  getCurrentUser,
  requireUser,
  requireAdmin,
  destroySession,
  isAuthenticated,
  isAdmin,
} from './session.server';
export type { SessionData, SessionFlashData } from './session.server';

// Authentication
export {
  verifyUserCredentials,
  registerUser,
  getUserById,
  toSessionData,
  validatePassword,
  validateEmail,
  validateUsername,
} from './auth.server';
export type { AuthUser } from './auth.server';

// Ownership & Access Control
export {
  assertChatSessionOwnership,
  getUserChatSessions,
  getChatMessages,
  canAccessAdmin,
  canModifySystemConfig,
} from './ownership.server';

// Chat Service
export {
  createChatSession,
  sendMessage,
  sendMessageStream,
  getAvailableModels,
  updateSessionTitle,
  deleteChatSession,
  getChatSessionMeta,
} from './chat.server';
export type {
  CreateChatSessionInput,
  SendMessageInput,
  ChatMessageOutput,
  SendMessageResult,
  SSEEvent,
} from './chat.server';

// OpenAI Service
export {
  sendChatCompletion,
  streamChatCompletion,
  testOpenAIConnection,
} from './openai.server';
export type {
  ChatCompletionMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
} from './openai.server';
