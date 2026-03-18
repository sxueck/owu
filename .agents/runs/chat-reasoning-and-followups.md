# Runbook: chat-reasoning-and-followups

- Spec path: `.agents/specs/chat-reasoning-and-followups.md`
- Shared status: verified_pending_migration
- Current focus: 实现已通过代码复核，剩余事项是数据库 migration 在有权限的环境中落地

## Workstream Assignments

- `schema-and-contracts`: assigned `implementer`, status `completed`, attempts `1`
- `streaming-reasoning`: assigned `implementer`, status `completed`, attempts `1`, depends on `schema-and-contracts`
- `followup-generation`: assigned `implementer`, status `completed`, attempts `1`, depends on `streaming-reasoning`
- `chat-ui-rendering`: assigned `implementer`, status `completed`, attempts `1`, depends on `streaming-reasoning`, `followup-generation`

## Dependency State

- `schema-and-contracts` 是前置工作，负责稳定消息结构、持久化字段和 SSE 事件契约
- `streaming-reasoning` 与 `followup-generation` 依赖共享契约稳定后再执行
- `chat-ui-rendering` 依赖 reasoning 事件和追问建议输出形态稳定后再接入
- 事件时序固定为 `start -> reasoning/token -> complete -> suggestions`
- `suggestions` 只能在真实 `messageId` 已建立后追加
- 前端不再依赖整页 reload，而是按 `messageId` 合并 pending assistant 与建议问题

## Validation Expectations

- 默认以代码审查为主
- 如仓库已有便宜且直接相关的检查命令，可执行最小必要验证
- 如果环境或依赖阻塞，不重复扩大验证范围，优先保留 review-only 结论
- 争取执行最小必要验证：Prisma client 生成/迁移相关检查与 `npm run typecheck`

## Open Risks

- ✅ Reasoning 字段兼容性已处理：通过 `extractReasoningFromDelta` 支持多种 provider 格式，静默降级
- ✅ 追问建议生成失败处理：已确保失败时不影响主回答，仅记录 console warning
- ✅ 前端 SSE 切换完成：已使用 `@microsoft/fetch-event-source` 替代手写解析
- ✅ 整页刷新依赖已移除：状态管理通过 `messageId` 合并完成
- `streaming-reasoning` 与 `followup-generation` 若同改 `chat.server.ts` 容易冲突，因此本次按顺序执行
- 数据库 migration 尚未落地，当前环境的 shadow database 权限阻塞了 migration 创建
- `followUpQuestions` 使用 Json 字段，集成时仍需核对序列化与反序列化行为
- Reasoning 内容大小：使用 `@db.LongText` 存储，但超大 reasoning 内容可能影响数据库性能（罕见场景）
- Follow-up questions 生成成本：每次对话额外调用一次模型，可能增加成本和延迟
- 前端 AbortController 处理：已添加但需验证长时间对话中的稳定性
- ✅ `complete` 事件 reasoning 合并已修复：ref 在 SSE 事件处理当下同步，不再依赖 React state updater 批处理时机
- migration 尚未在当前环境落地
- SSE 事件类型仍有多处重复定义，后续维护存在 contract drift 风险

## Retry History

- `chat-ui-rendering` 审查未通过一次，原因是 complete 阶段 reasoning 合并使用了过期闭包状态
- ✅ 已修复：使用 `pendingAssistantRef` 同步最新状态，确保 complete 事件读取到最新的 reasoning
- 二次复核仍未通过，原因是 ref 同步时机过晚，无法彻底保证 complete 读取到最新 reasoning
- ✅ 已修复：在 `token`/`reasoning` 事件处理当下立即同步 ref，不再依赖 React state updater 批处理时机

## Files Touched

- `.agents/specs/chat-reasoning-and-followups.md`
- `.agents/runs/chat-reasoning-and-followups.md`
- `prisma/schema.prisma`
- `app/lib/server/chat.server.ts`
- `app/lib/server/ownership.server.ts`
- `app/routes/chat/stream.tsx`
- `app/routes/chat/session.tsx`
- `app/lib/server/openai.server.ts` - Added reasoning extraction and `onReasoning` callback to streaming
- `app/lib/server/chat.server.ts` - Added follow-up questions generation (`generateFollowUpQuestions`, `parseFollowUpQuestions`, `FOLLOWUP_GENERATION_PROMPT`) and integrated into streaming flow
- `app/routes/chat/session.tsx` - Replaced handwritten SSE with `@microsoft/fetch-event-source`, added `ReasoningPanel` and `FollowUpQuestions` components, implemented message merging by `messageId`, removed `window.location.reload()` dependency, fixed stale closure and race condition issues in complete handler by synchronizing ref immediately in SSE event handlers
- `package.json` - Added `@microsoft/fetch-event-source` dependency

## Checks Run

- `npm install @microsoft/fetch-event-source` 成功
- `prisma generate` 成功
- `npm run typecheck` 成功
- Reasoning streaming implementation validated:
  - `ChatCompletionResult` now includes optional `reasoning` field
  - `streamChatCompletion` accepts optional `onReasoning` callback
  - `sendMessageStream` forwards reasoning events and persists to database
  - Best-effort extraction supports `reasoning_content`, `thinking`, `reasoning` fields
- Follow-up generation implementation validated:
  - `generateFollowUpQuestions` function implemented with structured prompt
  - `parseFollowUpQuestions` handles JSON parsing with silent fallback
  - Follow-up generation runs after `complete` event (non-blocking)
  - `suggestions` event sent with `messageId` and `questions` after database update
  - Failures silently logged to console without affecting main response flow
- Frontend implementation validated:
  - Replaced handwritten SSE parsing with `@microsoft/fetch-event-source`
  - Implemented pending assistant state with `messageId`-based merging
  - `ReasoningPanel` component displays collapsible reasoning content (only when present)
  - `FollowUpQuestions` component displays clickable follow-up suggestions (only when present)
  - Removed `window.location.reload()` dependency - all updates via React state
  - Event handlers support `reasoning` and `suggestions` events with proper state merging
- Review fix validated:
  - Added `pendingAssistantRef` to track latest pending state
  - Ref is now updated immediately in `token`/`reasoning` event handlers, before React state update
  - Complete handler reads from ref which is always synchronized in event handler context
  - Fixed race condition where ref could be stale if events arrive in quick succession
  - `npm run typecheck` passes
- 最终 verifier 复核通过（review-only），确认 complete 合并、suggestions merge、条件渲染与无 reload 依赖均符合预期

## Blocked Items

- 无

## Notes

- ✅ `schema-and-contracts` 工作流已完成
- ✅ `streaming-reasoning` 工作流已完成
- ✅ `followup-generation` 工作流已完成
- ✅ `chat-ui-rendering` 工作流已完成
- 所有工作流已完成，聊天功能已完整支持 reasoning 展示和追问建议
- 数据结构已扩展，SSE 事件契约已统一，前后端类型已对齐
- Reasoning 流式链路已打通：
  - OpenAI SDK 流式响应中通过 `extractReasoningFromDelta` 以 best effort 策略提取 reasoning
  - 支持字段：`reasoning_content`（DeepSeek、OpenAI o1）、`thinking`（Anthropic）、`reasoning`（通用）
  - 提取失败时静默回退，不影响主回答 `token` / `complete` 事件
  - Reasoning 内容随 `complete` 事件持久化到数据库
- Follow-up suggestions 链路已打通：
  - 基于对话上下文和 assistant 回答生成 5 条追问建议
  - 使用结构化 JSON 输出格式，支持解析失败静默回退
  - 生成在 `complete` 事件之后执行，不阻塞主回答
  - `suggestions` 事件在数据库更新后发出，包含 `messageId` 和 `questions`
  - 生成失败时仅记录 console warning，不影响主流程
- 前端渲染已完成：
  - 使用 `@microsoft/fetch-event-source` 替代手写 SSE 解析
  - Reasoning 面板默认折叠，仅在存在 reasoning 内容时显示
  - 追问建议以按钮形式展示，点击直接发起新问题
  - 状态管理通过 `messageId` 合并，无需整页刷新
- Migration 文件未实际创建（数据库权限限制），但 schema 变更已就绪，可在合适环境执行 `prisma migrate dev`
- ✅ `verifier` 发现的 complete 阶段 reasoning 合并问题已修复（两次返修）
- 第一次修复：使用 ref 避免 stale closure
- 第二次修复：在 SSE 事件处理当下立即同步 ref，不再依赖 React state updater 批处理时机
- 最终复核通过，未发现阻断交付的高风险代码问题