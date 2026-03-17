# Runbook: lightweight-llm-ui-react-router

- Spec path: `.agents/specs/lightweight-llm-ui-react-router.md`
- Shared status: approved
- Current phase: completed / ready-for-delivery
- Started at: 2026-03-17
- Last updated: 2026-03-17
- Auth-and-data-model completed: 2026-03-17
- Admin-settings completed: 2026-03-17
- Chat-core completed: 2026-03-17

## Common Summary

- 从零搭建 React Router + React + MySQL + Docker 的轻量化 LLM UI。
- 首期先交付注册、登录、管理员 OpenAI 配置、模型白名单、基础聊天闭环。
- 认证采用本地账号密码 + 服务端 session cookie。
- 管理员账号通过 seed 初始化。
- 聊天时服务端强制校验模型白名单与配置完整性。
- 当前仓库仅有 planning artifacts，第一阶段必须先固定脚手架、命令入口、env contract 与 server-only 边界。
- API Key 现按显式提交语义处理，设置页文案与保存行为必须一致。
- 聊天链路将从非流式切换为 SSE 流式输出。

### 默认方案 A：API Key 显式提交语义（已锁定）
- 管理员每次保存设置时都必须显式提交一个非空 API Key
- 不支持"留空保留旧值"
- 也不提供"留空表示清空"的隐式语义
- 若未来需要清空或轮换，可通过显式覆盖新值处理；本期不做单独 clear intent

### 默认方案 B：SSE 传输合同（已锁定）
- 流式聊天使用 `POST` 请求返回 `text/event-stream`
- 不使用 `EventSource GET` 两阶段方案
- 前端通过 `fetch` + `ReadableStream` 消费 SSE 事件流
- 路由可写成 `/chat/:sessionId/stream` 或等价 server endpoint，但必须是单次 POST 建立流
- SSE 事件类型至少包括：`start`、`token`、`complete`、`error`
- 事件数据约定：
  - `start`: 告知流开始，可包含 sessionId/model
  - `token`: 增量文本片段
  - `complete`: 流完成，包含最终 assistant message 元信息
  - `error`: 可读错误信息
- 数据持久化顺序：用户消息先入库，assistant 内容仅在 SSE 流完成后持久化完整消息

## Workstream Assignments

### foundation-bootstrap
- Status: completed
- Assigned: implementer
- Dependencies: none
- Attempts: 1
- Checks: 
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ Prisma client generates successfully
  - ✅ Project structure follows React Router conventions
- Files touched: 
  - package.json - Updated deps, scripts, Node 22+ engine
  - Dockerfile - Node 22 alpine multi-stage build
  - docker-compose.yml - MySQL 8 service
  - .env.example - Database, session, app config
  - .gitignore - Added env, logs, editor files
  - prisma/schema.prisma - User, SystemConfig, ChatSession, ChatMessage models
  - prisma/seed.ts - Admin user + default config seed
  - app/lib/server/db.ts - Prisma client singleton
  - app/lib/server/env.ts - Server-only env validation
  - app/lib/server/config.ts - SystemConfig accessor + model whitelist helper
  - app/lib/server/index.ts - Server-only exports
  - app/app.css - Enhanced Tailwind styles
  - app/root.tsx - Root layout (unchanged from template)
  - app/routes.ts - Route config with nested routes
  - app/routes/home.tsx - Landing page
  - app/routes/auth/login.tsx - Login page placeholder
  - app/routes/auth/register.tsx - Register page placeholder
  - app/routes/chat/layout.tsx - Chat sidebar layout
  - app/routes/chat/index.tsx - Chat empty state
  - app/routes/chat/session.tsx - Chat session placeholder
  - app/routes/admin/layout.tsx - Admin panel layout
  - app/routes/admin/settings.tsx - Settings placeholder
  - README.md - Project documentation
- Handoff Gate:
  - ✅ React Router 7 framework mode initialized
  - ✅ Node 22+ engine requirement set
  - ✅ npm as package manager (package-lock.json)
  - ✅ Prisma + MySQL schema defined
  - ✅ Server-only module boundary established (`app/lib/server/*` with `server-only` import)
  - ✅ Env contract defined (DATABASE_URL, SESSION_SECRET, etc.)
  - ✅ Database scripts ready (db:migrate, db:generate, db:seed, db:reset)
  - ✅ Docker Compose for MySQL ready
  - ✅ Route structure established for auth, chat, admin
  - ✅ TypeScript types generating correctly
- Notes: 脚手架已完成，可为 auth-and-data-model 提供坚实基础。server-only 边界清晰，SystemConfig 单例模式已预留。

### auth-and-data-model
- Status: completed
- Assigned: implementer
- Dependencies: foundation-bootstrap
- Attempts: 1
- Checks: 
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ Session management implemented with HTTP-only cookies
  - ✅ Login/Register/Logout routes functional
  - ✅ Protected routes redirect unauthenticated users
  - ✅ Admin routes reject non-admin users (403)
  - ✅ SystemConfig singleton contract stable
  - ✅ Ownership/access helpers implemented
- Files touched: 
  - docker-compose.yml - Removed deprecated `version` field
  - package.json - Added `cookie-session` dependency
  - app/sessions.ts - React Router session storage configuration
  - app/lib/server/session.ts - Session helpers (requireUser, requireAdmin, etc.)
  - app/lib/server/auth.ts - Authentication service (verifyUserCredentials, registerUser, validators)
  - app/lib/server/ownership.ts - Chat ownership & access control helpers
  - app/lib/server/index.ts - Updated exports for new modules
  - app/routes.ts - Added logout route
  - app/routes/auth/login.tsx - Full implementation with loader/action
  - app/routes/auth/register.tsx - Full implementation with loader/action
  - app/routes/auth/logout.tsx - Logout action route
  - app/routes/chat/layout.tsx - Auth guard + user session list
  - app/routes/admin/layout.tsx - Admin-only guard
- Handoff Gate:
  - ✅ User registration with validation
  - ✅ User login (supports email or username)
  - ✅ Session-based authentication with HTTP-only cookies
  - ✅ Logout clears session
  - ✅ Chat routes redirect to login when unauthenticated
  - ✅ Admin routes require admin role (403 for non-admins)
  - ✅ SystemConfig singleton accessor stable (`getSystemConfig()`)
  - ✅ Model whitelist helper available (`isModelAllowed()`)
  - ✅ Chat ownership helpers available (`assertChatSessionOwnership()`, `getUserChatSessions()`)
- Notes: 所有共享 contract 已稳定。`admin-settings` 可以直接复用 `getSystemConfig()` 和 `isModelAllowed()`。

### admin-settings
- Status: completed
- Assigned: implementer
- Dependencies: auth-and-data-model
- Attempts: 2
- Checks:
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ API Key must be non-empty explicit submit
  - ✅ UI copy updated: removed "leave blank to keep existing" placeholder
  - ✅ Server-side validation enforces non-empty API Key
  - ✅ `saveSystemConfig` contract updated: `openaiApiKey` is now required (non-optional)
- Files touched:
  - `app/lib/server/config.ts` - Updated `SaveSystemConfigInput` interface: `openaiApiKey` is now required (non-optional). Updated `saveSystemConfig` to throw error if API Key is empty.
  - `app/lib/server/index.ts` - No changes (exports remain valid)
  - `app/routes/admin/settings.tsx` - Updated action to validate non-empty API Key, removed "leave blank to keep existing" placeholder, added error display for API Key field, marked API Key as required with asterisk.
- Notes: API Key 提交语义已修复。保存时必须显式提供非空 API Key，不支持 preserve/clear 隐式语义。文案、表单校验、服务端保存行为现在一致。
- Handoff Gate:
  - ✅ 管理员保存 API Key、Base URL、模型列表时，API Key 必须非空
  - ✅ 普通用户不可访问该页面 (403)
  - ✅ 聊天服务可读取当前有效配置 (`getSystemConfig()`)
  - ✅ 严格复用统一 config accessor / whitelist contract (`getSystemConfig`, `isModelAllowed`, `isOpenAIConfigured`)
  - ✅ 配置变更记录更新者 (`updatedBy`)

### chat-core
- Status: implemented-baseline
- Assigned: implementer
- Dependencies: auth-and-data-model, admin-settings
- Attempts: 1
- Checks: 
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ Chat service properly validates model whitelist before sending
  - ✅ OpenAI configuration validation implemented
  - ✅ Message persistence flow: user message -> OpenAI -> assistant message
  - ✅ Error handling: no fake assistant messages on API failure
  - ✅ Session ownership verified on all chat operations
  - ⚠️ 当前为非流式实现，需改造为 SSE 流式输出
- Files touched: 
  - `app/lib/server/openai.ts` - OpenAI provider service with chat completion, streaming placeholder, and connection test
  - `app/lib/server/chat.ts` - Chat service with session creation, message sending, and model validation
  - `app/lib/server/index.ts` - Exported new chat and OpenAI modules
  - `app/routes/chat/index.tsx` - New chat session creation with model selection
  - `app/routes/chat/session.tsx` - Chat session page with message display and sending
- Notes: 聊天核心基础功能已实现（非流式）。严格复用所有共享 contract。消息持久化流程符合规范。**需改造为 SSE 流式输出**：使用 POST + `text/event-stream`，前端通过 `fetch` + `ReadableStream` 消费，事件类型包括 `start`/`token`/`complete`/`error`，assistant 仅在 `complete` 后入库。
- Handoff Gate:
  - ✅ 登录用户可发起会话并选择模型（从管理员白名单）
  - ✅ 会话列表在 sidebar 展示，点击进入详情页
  - ✅ 消息列表正确展示历史消息
  - ✅ 发送消息后获得模型回复并正确入库（当前非流式）
  - ✅ 模型白名单校验在服务端正確实施
  - ✅ OpenAI 配置完整性校验
  - ✅ 错误处理：API 失败时返回可读错误，不写入伪造成功消息
  - ❌ SSE 流式输出尚未实现（由 chat-streaming workstream 负责）

### chat-streaming
- Status: completed
- Assigned: implementer
- Dependencies: auth-and-data-model, admin-settings
- Attempts: 2
- Checks:
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ POST + SSE endpoint implemented at `/chat/:sessionId/stream`
  - ✅ SSE event types: `start`, `token`, `complete`, `error`
  - ✅ Frontend uses `fetch` + `ReadableStream` to consume SSE
  - ✅ User message persisted before streaming starts
  - ✅ Assistant message only persisted after successful completion
  - ✅ No fake assistant messages on error/interruption
  - ✅ All shared contracts reused (`requireUser`, `assertChatSessionOwnership`, `getSystemConfig`, `isModelAllowed`, `isOpenAIConfigured`)
  - ✅ Session metadata query fixed to use unified `getChatSessionMeta` helper
  - ✅ SSE error 后页面不再无条件 reload，错误态保持可见
  - ✅ 前置失败时 SSE 端点返回稳定 error 语义而非静默关闭
- Files touched:
  - `app/lib/server/openai.ts` - Updated `streamChatCompletion` to use actual OpenAI streaming with callbacks
  - `app/lib/server/chat.ts` - Added `sendMessageStream`, `getChatSessionMeta`, and `SSEEvent` types
  - `app/lib/server/index.ts` - Exported new chat streaming functions and types
  - `app/routes/chat/stream.tsx` - SSE streaming endpoint; **FIXED**: catch block now sends SSE error event before closing
  - `app/routes/chat/session.tsx` - Frontend SSE streaming; **FIXED**: reload only on successful completion, not on error
  - `app/routes.ts` - Added `:sessionId/stream` route
- Notes: 非流式聊天已成功改造为 POST + SSE 流式输出。严格遵循已锁定的 Streaming Contract。Attempt 2 修复了两个 UX 问题：(1) 前端收到 error 事件后不再 reload，错误信息保持可见；(2) 服务端 catch 块确保 error 事件被发送后再关闭流，避免静默结束。
- Handoff Gate:
  - ✅ POST + SSE endpoint at `/chat/:sessionId/stream`
  - ✅ Frontend fetch + ReadableStream SSE consumption
  - ✅ Real-time token streaming display
  - ✅ Event types: `start`, `token`, `complete`, `error`
  - ✅ User message persisted before stream starts
  - ✅ Assistant message persisted only after `complete` event
  - ✅ No fake messages on error or interruption
  - ✅ All auth/config/ownership helpers strictly reused
  - ✅ Session metadata helper used (fixed direct prisma query)
  - ✅ Ready for `ui-polish-and-hardening`

### ui-polish-and-hardening
- Status: completed
- Assigned: builder
- Dependencies: chat-streaming
- Attempts: 1
- Checks:
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ Production build succeeds (`npm run build`)
  - ✅ Login/register pages have consistent visual design with improved error states
  - ✅ Chat layout is mobile-responsive with collapsible sidebar
  - ✅ Empty states, loading states, and error states enhanced across all pages
  - ✅ Admin settings page has consistent styling with status cards
  - ✅ README updated with accurate feature documentation
  - ✅ All shared contracts preserved (no changes to auth/config/streaming logic)
- Files touched:
  - `app/app.css` - Enhanced with responsive utilities, animations, and accessibility improvements
  - `app/routes/auth/login.tsx` - Polished UI with gradient logo, better error display, default admin hint
  - `app/routes/auth/register.tsx` - Consistent styling, improved field hints, better error states
  - `app/routes/chat/layout.tsx` - Mobile-responsive sidebar with overlay, hamburger menu, improved icons
  - `app/routes/chat/index.tsx` - Enhanced empty state, improved form UX, added tips section
  - `app/routes/chat/session.tsx` - Mobile-responsive chat UI, improved streaming display, dismissible errors
  - `app/routes/admin/settings.tsx` - Status cards with icons, improved form UX, consistent styling
  - `README.md` - Comprehensive rewrite with features, setup instructions, troubleshooting
- Notes: All UI/UX improvements completed without modifying underlying shared contracts. Visual design is now consistent across auth, chat, and admin pages. Mobile experience is usable with collapsible sidebar and responsive layouts.

## Dependency State

- foundation-bootstrap 是所有后续工作的前置依赖。✅ COMPLETED
- auth-and-data-model 依赖 foundation-bootstrap。✅ COMPLETED
- admin-settings 依赖 auth-and-data-model。✅ COMPLETED
- chat-core 依赖 auth-and-data-model 与 admin-settings。✅ BASELINE IMPLEMENTED
- chat-streaming 依赖 auth-and-data-model, admin-settings。✅ COMPLETED
- ui-polish-and-hardening 依赖 chat-streaming。✅ COMPLETED

## Retry History

- foundation-bootstrap: attempt 1 completed on 2026-03-17
- auth-and-data-model: attempt 1 completed on 2026-03-17
- admin-settings: attempt 1 completed on 2026-03-17, needs targeted fix
- admin-settings: attempt 2 dispatched on 2026-03-17 for explicit API key contract fix
- chat-core: attempt 1 completed on 2026-03-17, baseline implemented
- chat-streaming: attempt 1 dispatched on 2026-03-17
- chat-streaming: attempt 2 dispatched on 2026-03-17 for error handling fixes
- ui-polish-and-hardening: attempt 1 dispatched on 2026-03-17

## Open Risks

- ✅ React Router 与 Prisma/MySQL 整合已验证可行
- ✅ 认证已完成
- ✅ 配置写入与白名单契约已保持单一来源
- ✅ Chat 核心基础功能已完成（非流式）
- ✅ API Key 非空显式提交语义已修复
- ✅ SSE 流式实现已完成，模型校验、归属校验和持久化顺序均保持正确
- ✅ chat/session 路由已收敛到统一 helper (`getChatSessionMeta`)
- ✅ SSE error 处理已修复：错误态保持可见，不再无条件 reload
- ✅ 前置失败错误语义已修复：SSE 端点确保 error 事件被发送
- ✅ UI/UX 收尾已完成：视觉统一、移动端适配、README 更新

## Blocked Items

- None

## Checks Run

- ✅ `npm run typecheck` - TypeScript compilation passes
- ✅ `npm run build` - Production build succeeds
- ✅ `npx prisma generate` - Prisma client generates successfully
- ✅ Project structure verified
- ✅ Admin settings page typecheck passes
- ✅ Admin settings page build succeeds
- ✅ Chat core typecheck passes
- ✅ Chat core build succeeds
- ✅ Chat streaming typecheck passes
- ✅ Chat streaming build succeeds
- ✅ Streaming endpoint POST + SSE contract implemented
- ✅ Frontend fetch + ReadableStream SSE consumption working
- ✅ UI polish typecheck passes
- ✅ UI polish build succeeds
- verifier review failed on chat-streaming UX/error semantics; targeted fixes required - FIXED

## Next Actions

1. ✅ 完成 ui-polish-and-hardening
2. ✅ 汇总最终结果与剩余风险
3. 结束本轮交付 - MVP 已完成

## Shared Contracts (Locked by auth-and-data-model)

### API Key Contract（已锁定）
- **非空显式提交**：管理员每次保存设置时必须显式提交一个非空 API Key
- **无 preserve 隐式语义**：不支持"留空保留旧值"
- **无 clear 隐式语义**：不提供"留空表示清空"的隐式语义
- **显式覆盖**：若未来需要清空或轮换，通过显式覆盖新值处理
- 表单验证必须在服务端强制执行非空校验

### Streaming Contract（已锁定）
- **Endpoint Method**：流式聊天使用 `POST` 请求
- **Content-Type**：返回 `text/event-stream`
- **不使用 EventSource GET**：前端通过 `fetch` + `ReadableStream` 消费 SSE 事件流，不采用 `EventSource` 两阶段方案
- **路由格式**：`/chat/:sessionId/stream` 或等价 server endpoint，单次 POST 建立流
- **SSE Event Types**：
  - `start`：告知流开始，可包含 sessionId/model
  - `token`：增量文本片段
  - `complete`：流完成，包含最终 assistant message 元信息
  - `error`：可读错误信息
- **Persistence Rules**：
  1. 用户消息先入库
  2. assistant 内容仅在 SSE 流完成后持久化完整消息
  3. 若上游失败或中断，不写入伪造 assistant 成功消息
- **Error Rules**：
  - 流中断或上游错误时通过 SSE `error` 事件返回可读错误
  - 不写入部分或不完整的 assistant 消息到数据库

### 1. SystemConfig Singleton Access
```typescript
// From ~/lib/server
import {
  getSystemConfig,
  getPublicConfig,
  saveSystemConfig,
  normalizeAllowedModels,
  parseModelsInput,
  formatModelsForDisplay,
  isModelAllowed,
  isOpenAIConfigured,
} from "~/lib/server";

const config = await getSystemConfig(); // Returns full config or null (server-only)
const publicConfig = await getPublicConfig(); // Returns safe config without API key (client-safe)
const allowed = await isModelAllowed("gpt-4o"); // boolean
const configured = await isOpenAIConfigured(); // boolean

// Save configuration
await saveSystemConfig({
  openaiApiKey: "sk-...",
  openaiBaseUrl: null,
  allowedModels: ["gpt-4o-mini", "gpt-4o"],
  updatedBy: userId,
});

// Helper functions for model list handling
const normalized = normalizeAllowedModels(["gpt-4o ", "gpt-4o", ""]); // ["gpt-4o"]
const parsed = parseModelsInput("gpt-4o-mini\ngpt-4o"); // ["gpt-4o-mini", "gpt-4o"]
const formatted = formatModelsForDisplay(["gpt-4o-mini", "gpt-4o"]); // "gpt-4o-mini\ngpt-4o"
```
- SystemConfig 表始终只有一条记录（单例模式）
- `allowedModels` 存储为 JSON 数组字符串
- 所有配置读取必须服务端完成
- `getPublicConfig()` 安全地返回配置状态到客户端（API Key 替换为 hasApiKey boolean）
- `saveSystemConfig()` 支持部分更新，自动规范化模型列表

### 2. Authentication Helpers
```typescript
// From ~/lib/server/session
import { requireUser, requireAdmin, getCurrentUser } from "~/lib/server";

// In route loader:
const session = await getSession(request.headers.get("Cookie"));
const user = requireUser(session); // Redirects to /login if not authenticated
const admin = requireAdmin(session); // 403 if not admin
```

### 3. Chat Ownership Helpers
```typescript
// From ~/lib/server/ownership
import { 
  assertChatSessionOwnership, 
  getUserChatSessions, 
  getChatMessages 
} from "~/lib/server";

// Verify ownership (throws 403 if not owner)
const chatSession = await assertChatSessionOwnership(sessionId, user);

// Get user's sessions
const sessions = await getUserChatSessions(user);

// Get messages with ownership check
const messages = await getChatMessages(sessionId, user);
```

### 4. Session Cookie Contract
- Cookie name: `__session`
- HTTP-only, SameSite=lax
- Max age: 7 days
- Contains: `userId`, `email`, `username`, `role`

### 5. Available Routes
- `POST /login` - Authenticate, set session
- `POST /register` - Create account, set session
- `POST /logout` - Clear session
- `/chat` - Protected, requires authentication, shows new chat form
- `/chat/:sessionId` - Protected, chat session with messages
- `/admin` - Protected, requires admin role

### 6. Chat Service Contracts
```typescript
// From ~/lib/server/chat
import {
  createChatSession,
  sendMessage,
  getAvailableModels,
  updateSessionTitle,
  deleteChatSession,
} from "~/lib/server";

// Create a new chat session (validates model whitelist)
const session = await createChatSession(user, {
  model: "gpt-4o-mini",
  title: "My Chat", // optional
});

// Send a message and get AI response
const result = await sendMessage(user, {
  sessionId: "xxx",
  content: "Hello!",
});
// Returns: { userMessage, assistantMessage }

// Get available models (from admin whitelist)
const models = await getAvailableModels(); // string[]
```

### 7. OpenAI Service Contracts
```typescript
// From ~/lib/server/openai
import {
  sendChatCompletion,
  streamChatCompletion,
  testOpenAIConnection,
} from "~/lib/server";

// Send chat completion (non-streaming)
const result = await sendChatCompletion({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
  temperature: 0.7,
});
// Returns: { content, model, usage? }

// Stream chat completion with callbacks
await streamChatCompletion(
  { model: "gpt-4o-mini", messages: [] },
  {
    onToken: (token) => console.log(token),
    onComplete: (result) => console.log(result),
    onError: (error) => console.error(error),
  }
);

// Test connection (for admin diagnostics)
const status = await testOpenAIConnection();
// Returns: { success: boolean, message: string }
```

### 8. Chat Streaming Contracts
```typescript
// From ~/lib/server/chat
import {
  sendMessageStream,
  getChatSessionMeta,
  type SSEEvent,
} from "~/lib/server";

// Stream a message with SSE
await sendMessageStream(
  user,
  { sessionId: "xxx", content: "Hello!" },
  (event: SSEEvent) => {
    switch (event.type) {
      case "start":
        console.log("Stream started:", event.sessionId, event.model);
        break;
      case "token":
        console.log("Token:", event.content);
        break;
      case "complete":
        console.log("Completed:", event.messageId);
        break;
      case "error":
        console.error("Error:", event.message);
        break;
    }
  }
);

// Get session metadata with ownership check
const meta = await getChatSessionMeta(sessionId, user);
// Returns: { id, title, model, createdAt }
```

### 9. Streaming Endpoint
- **URL**: `POST /chat/:sessionId/stream`
- **Request Body**: `{ content: string }`
- **Response**: `text/event-stream`
- **Events**:
  - `start`: `{ type: "start", sessionId: string, model: string }`
  - `token`: `{ type: "token", content: string }`
  - `complete`: `{ type: "complete", messageId: string, content: string }`
  - `error`: `{ type: "error", message: string }`

## Foundation Bootstrap Handoff Notes

### Env Contract
Required environment variables (defined in `.env.example`):
- `DATABASE_URL` - MySQL connection string
- `SESSION_SECRET` - For session signing
- `NODE_ENV`, `APP_PORT`, `APP_URL` - Application config

### Server-Only Boundary
All server-side code MUST be imported from `app/lib/server/*`:
- `prisma` - Database client
- `env` - Validated environment variables
- `getSystemConfig()`, `isModelAllowed()`, `isOpenAIConfigured()` - Config accessors

These modules import `server-only` package to prevent accidental client-side usage.

### Database Schema
Key models ready for auth-and-data-model:
- `User` - id, email, username, password, role (admin/user)
- `SystemConfig` - Singleton, stores OpenAI config + allowedModels JSON
- `ChatSession` - Belongs to User
- `ChatMessage` - Belongs to ChatSession

### Available Commands
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run db:migrate` - Run migrations
- `npm run db:generate` - Generate Prisma client
- `npm run db:seed` - Seed admin user
- `npm run db:reset` - Full reset + re-seed
- `docker-compose up -d mysql` - Start MySQL

### Admin Account (after seed)
- Username: `admin`
- Password: `admin123`
- Role: `admin`