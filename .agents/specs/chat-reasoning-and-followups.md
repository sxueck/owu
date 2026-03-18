---
slug: chat-reasoning-and-followups
title: 聊天思考过程展示与追问建议
status: approved
---

## Goal

为当前聊天页面增加两项能力：

1. assistant 回复支持显示模型的思考过程（reasoning / thinking）
2. assistant 回复完成后，在回答下方展示 5 条用户可能想继续追问的问题

其中，思考过程遵循“解析到则显示，解析不到则不显示”的策略，避免对不支持 reasoning 的模型产生无效 UI。

## Scope

- 扩展聊天消息数据结构，支持保存 reasoning 与追问建议
- 扩展后端流式链路，支持传递 reasoning 流片段和追问建议结果
- 前端将现有手写 SSE 解析替换为成熟方案 `@microsoft/fetch-event-source`
- 前端 assistant 消息卡片支持 reasoning 折叠展示
- 前端在 assistant 回复下方展示 5 条可点击追问建议
- 点击追问建议后直接发起新一轮提问
- 历史消息加载时可恢复 reasoning 与追问建议

## Non-Goals

- 不实现完整的 OpenWebUI 式工具调用状态面板、agent status 区或多类 event timeline
- 不在本次改造中切换到 OpenAI Responses API；仍基于当前 `chat.completions` 流式链路扩展
- 不强制要求所有模型都产出 reasoning；不支持时仅静默降级
- 不实现“点击追问后先填入输入框再等待用户编辑”的交互
- 不在本次引入复杂的推荐排序、个性化追问或多轮上下文重写策略

## Constraints

- 当前后端流式能力基于 `app/lib/server/openai.server.ts` 的 `chat.completions.create({ stream: true })`
- 当前 `streamChatCompletion` 仅处理 `delta.content`，尚未兼容 reasoning 相关字段
- 当前 SSE 事件定义仅有 `start/token/complete/error`
- 当前前端 `app/routes/chat/session.tsx` 使用手写 `ReadableStream` + buffer 解析 SSE
- 当前 `ChatMessage` 只有 `content` 主体，没有 metadata 字段
- 需要 Prisma schema 变更与 migration
- reasoning 字段来源存在模型差异，必须以“尽力解析、解析不到就忽略”的兼容策略实现
- 追问建议生成不能影响主回答成功返回；主回答成功优先级更高

## Common Summary

- 目标是在不破坏现有聊天链路的前提下，为 assistant 消息增加两个可选增强能力：`reasoning` 和 `follow-up suggestions`
- 主链路仍以现有聊天回答为核心；reasoning 是可选流式附加信息，追问建议是回答完成后的附加产物
- 前端 SSE 消费改为 `@microsoft/fetch-event-source`，服务端继续输出标准 SSE，并新增自定义事件
- 数据持久化放在 `ChatMessage` 维度，确保刷新页面后历史消息可恢复
- reasoning 的展示规则固定为：有解析结果才渲染，没有就完全不渲染
- 依赖顺序为：数据结构与协议定义 -> 流式与生成逻辑 -> 前端渲染与交互 -> 回归检查
- 当前不确定点主要是实际 provider 返回的 reasoning 形态，因此解析器设计要允许多来源兼容并静默降级
- 前端需要采用"pending assistant -> complete 绑定真实 messageId -> suggestions 按 messageId merge"的单一消息合并策略，不能依赖整页 reload 观察最终状态
- 为降低同文件冲突与事件时序漂移，执行顺序改为：`schema-and-contracts -> streaming-reasoning -> followup-generation -> chat-ui-rendering`

## Context Facts

- `app/lib/server/openai.server.ts:153` 的 `streamChatCompletion` 目前只通过 `delta.content` 累加主回答
- `app/lib/server/chat.server.ts:286` 的 SSE 事件类型目前只有 `start/token/complete/error`
- `app/lib/server/chat.server.ts:307` 的 `sendMessageStream` 在流式完成后才持久化 assistant 消息
- `app/routes/chat/stream.tsx:20` 已输出标准 SSE 文本格式，可继续沿用
- `app/routes/chat/session.tsx:354` 目前前端自己拆 chunk 和 `event:` / `data:` 行
- `app/routes/chat/session.tsx:389` 在收到 `complete` 后把 assistant 消息写入前端状态，然后 `window.location.reload()`
- `prisma/schema.prisma:64` 的 `ChatMessage` 尚无 `reasoning` 或建议问题字段
- 代码库中未发现现成的 follow-up suggestion 生成实现
- 用户已明确要求 reasoning 行为参考 OpenWebUI：解析到才显示，没解析到不显示

## Workstreams

### Workstream: `schema-and-contracts`
- `workstream_id`: `schema-and-contracts`
- `recommended_agent`: `implementer`
- `status`: `approved`
- `depends_on`: 无
- `unblocks`: `streaming-reasoning`, `followup-generation`, `chat-ui-rendering`
- `critic_review_required`: 否
- `scope`:
  - 扩展 `ChatMessage` 数据模型以保存 reasoning 和追问建议
  - 统一 loader / server output / SSE event 的共享数据形态
  - 明确 assistant 消息在"流式中"和"持久化后"的字段结构
  - 明确 SSE 事件顺序，尤其 `complete` 与 `suggestions` 的时序
  - 明确前端 pending assistant 的合并策略与真实 `messageId` 绑定方式
- `likely_files`:
  - `prisma/schema.prisma`
  - `app/lib/server/chat.server.ts`
  - `app/routes/chat/stream.tsx`
  - `app/routes/chat/session.tsx`
- `acceptance_slice`:
  - 服务端和前端共享的消息结构可表达 `reasoning?: string | null` 与 `followUpQuestions?: string[]`
  - SSE 事件结构可表达 reasoning 增量和建议问题结果
- `review_evidence`:
  - schema diff
  - 类型定义 diff
  - 路由/loader 返回结构与事件定义对齐

### Workstream: `streaming-reasoning`
- `workstream_id`: `streaming-reasoning`
- `recommended_agent`: `implementer`
- `status`: `approved`
- `depends_on`: `schema-and-contracts`
- `unblocks`: `chat-ui-rendering`
- `critic_review_required`: 否
- `scope`:
  - 扩展 `streamChatCompletion`，兼容 reasoning 相关流式字段解析
  - 在 `sendMessageStream` 中转发 reasoning 事件并在完成后持久化 reasoning
  - 保持主回答流式输出不回退
- `likely_files`:
  - `app/lib/server/openai.server.ts`
  - `app/lib/server/chat.server.ts`
  - `app/routes/chat/stream.tsx`
- `dependency_note`:
  - 依赖统一的字段契约；如果 reasoning 解析源不稳定，必须按"best effort + silent fallback"实现，不能阻塞主回答
  - 该工作流负责先稳定主流式生命周期与 reasoning 事件挂接点，供后续 suggestions 复用
- `acceptance_slice`:
  - 解析到 reasoning 时，能通过 SSE 发送到前端并在完成后持久化
  - 未解析到 reasoning 时，不影响 `token` / `complete` 事件正常工作
- `review_evidence`:
  - 关键流式分支代码 diff
  - reasoning 缓冲与完成落库逻辑可读、无主链路回归迹象

### Workstream: `followup-generation`
- `workstream_id`: `followup-generation`
- `recommended_agent`: `implementer`
- `status`: `approved`
- `depends_on`: `streaming-reasoning`
- `unblocks`: `chat-ui-rendering`
- `critic_review_required`: 否
- `scope`:
  - 在 assistant 主回答完成后生成 5 条追问建议
  - 将结果持久化到对应 assistant 消息
  - 将建议问题通过 SSE 或完成后的状态更新返回给前端
- `likely_files`:
  - `app/lib/server/chat.server.ts`
  - `app/lib/server/openai.server.ts`
- `dependency_note`:
  - 该流程不能阻塞主回答落库；若建议生成失败，应降级为无建议问题
  - `suggestions` 事件只能在 assistant `messageId` 已确定后发出，失败时静默省略
- `acceptance_slice`:
  - assistant 回复完成后最多展示 5 条建议问题
  - 生成失败时主回答仍正常完成
- `review_evidence`:
  - 生成 prompt/调用逻辑 diff
  - 错误处理分支清晰，失败仅影响建议问题本身

### Workstream: `chat-ui-rendering`
- `workstream_id`: `chat-ui-rendering`
- `recommended_agent`: `implementer`
- `status`: `approved`
- `depends_on`: `streaming-reasoning`, `followup-generation`
- `unblocks`: 无
- `critic_review_required`: 否
- `scope`:
  - 用 `@microsoft/fetch-event-source` 替换当前手写 SSE 解析
  - 为 assistant 消息增加 reasoning 折叠面板
  - 在 assistant 消息下方增加 5 条追问建议按钮
  - 点击建议后直接复用现有 `submitPrompt`
  - 消除依赖 `window.location.reload()` 的粗粒度刷新，优先用前端状态完成更新
  - 移除对 `window.location.reload()` 的依赖，改为基于 `messageId` 的本地状态合并
- `likely_files`:
  - `app/routes/chat/session.tsx`
- `dependency_note`:
  - 前端展示层依赖前两个工作流先稳定输出字段与事件
- `acceptance_slice`:
  - 有 reasoning 才显示 reasoning UI；没有就完全不显示
  - assistant 消息完成后显示建议问题
  - 点击建议问题后可直接发送
  - SSE 消费不再依赖手写字符串拆分逻辑
- `review_evidence`:
  - UI diff
  - 状态流转逻辑 diff
  - 关键交互代码可读、无明显重复状态源

## Shared Contracts

- `ChatMessage` 扩展字段建议：
  - `reasoning: String?`
  - `followUpQuestions: Json?` 或等效可表达 `string[]` 的字段
- loader 返回的 assistant message 建议包含：
  - `reasoning?: string | null`
  - `followUpQuestions?: string[] | null`
- SSE 事件建议扩展为：
  - `start`
  - `token`
  - `reasoning`
  - `complete`
  - `suggestions`
  - `error`
- 事件语义建议：
  - `token`: assistant 主回答增量
  - `reasoning`: reasoning 增量或阶段性文本
  - `complete`: assistant 主回答已完成并已持久化，至少包含 `messageId` 与 `content`
  - `suggestions`: 该 assistant 消息对应的 5 条追问建议已生成，可包含 `messageId` 与 `questions`
- UI 显示契约：
  - `reasoning` 为空、缺失、解析失败时，不显示 reasoning 区域
  - `followUpQuestions` 为空或少于 1 条时，不显示建议区域
  - 建议问题点击后默认直接发起提问
- 事件时序契约：`start` -> 零到多次 `reasoning` / `token` -> `complete` -> 零或一次 `suggestions`；`error` 可在失败路径终止
- 前端消息合并契约：流式阶段维护单个 pending assistant；`complete` 到达时转正并绑定真实 `messageId`；`suggestions` 通过 `messageId` merge 到对应 assistant 消息

## Acceptance Criteria

- 聊天主回答保持现有流式能力，未引入明显回归
- 如上游模型返回 reasoning 且被成功解析，assistant 消息显示可折叠“思考过程”区域
- 如未解析到 reasoning，不渲染 reasoning 区域，也不展示空白占位
- 每条 assistant 消息完成后，页面展示 5 条追问建议
- 点击追问建议可直接发起新提问
- 刷新页面后，历史 assistant 消息仍可恢复 reasoning 与追问建议
- 前端 SSE 消费改为成熟库，不再依赖现有手写 chunk/line 解析逻辑
- 追问建议生成失败时，不影响主回答成功返回与保存

## Review Plan

- 先检查 schema 和共享契约是否一致，避免前后端字段漂移
- 检查 reasoning 解析实现是否采用“best effort”而非强依赖某单一 provider 格式
- 检查追问建议生成是否与主回答链路解耦，失败时是否只局部降级
- 检查前端是否真正移除了手写 SSE 解析主逻辑，并正确接入 `@microsoft/fetch-event-source`
- 检查 reasoning UI 是否遵守“有则显示，无则不显示”
- 检查是否仍存在必须依赖整页刷新才能看到最终状态的路径；若保留 reload，需有明确必要性说明
- 检查是否移除了对整页 reload 的依赖
- 检查 SSE 类型定义是否收敛为单一来源，避免前后端重复漂移
- 默认以代码审查为主；如仓库已有便宜且直接相关的检查命令，可补充最小必要验证
- 补充最小验证：Prisma client 生成/迁移相关检查与 `npm run typecheck`（如仓库已有）

## Open Questions

- `ChatMessage.followUpQuestions` 最终采用 `Json` 还是独立表；当前更推荐 `Json`，简单且满足需求
- reasoning 解析具体兼容哪些上游字段，需要以当前 provider 实际响应为准；实现上应先支持显式字段，再允许后续扩展
- 追问建议是否通过同一模型生成，还是未来切分到更轻量模型；本次默认复用当前会话模型或同 provider 配置
- ~~assistant 完成后是否仍保留 `window.location.reload()` 作为兜底~~ 当前计划明确去掉该依赖，改为前端状态合并