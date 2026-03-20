---
slug: memory-summary-generation
title: Memory Summary Generation for User Long-Term Memory
status: implemented
---

## Goal
在“用户设置 > 长期记忆”中新增“记忆总结”能力：用户可显式勾选若干记忆条目并授权模型读取这些内容，模型基于所选条目归纳用户的语言习惯、偏好和做事风格，随后自动生成一条新的长期记忆记录保存到系统中。

## Scope
- 扩展长期记忆数据模型，保留记忆来源，至少区分 `manual` 与 `ai_summary`。
- 在长期记忆列表中增加多选状态与批量选择交互。
- 增加“生成记忆总结”入口、确认说明、处理中状态和错误反馈。
- 新增服务端总结接口，接收所选记忆 ID，做 ownership 校验，调用模型生成总结文本，并创建新的记忆记录。
- 生成后的新记忆回写到现有列表，并保留原始记忆不变。
- 新生成的记忆继续沿用现有机制参与聊天上下文注入。

## Non-Goals
- 不实现自动后台提取、自动定时总结或对话后自动生成记忆。
- 不实现原始记忆与总结记忆的自动合并、覆盖、去重或删除。
- 不新增复杂记忆元数据，如标签、优先级、启用开关、时效策略。
- 不改变当前“所有记忆均注入聊天上下文”的基本机制。
- 不新增独立设置页路由或独立的记忆管理页面。

## Constraints
- 当前 `UserMemory` 仅有 `content` 字段，必须扩展 Prisma schema 才能保留记忆来源。
- 当前长期记忆 UI 和 CRUD 集中在 `app/routes/chat/layout.tsx` 与 `/api/user/memories*` 路由，新增能力应尽量沿用现有模式。
- 当前聊天请求会通过 `app/lib/server/chat.server.ts:701` 将全部记忆拼接进 system prompt；新生成的总结记忆会立刻影响后续对话。
- 模型调用应复用现有 `app/lib/server/openai.server.ts:235` 的 `sendChatCompletion()` 和现有模型解析能力，而不是引入新 provider 流程。
- 默认使用用户当前默认模型；若其失效，则沿用现有设置系统的回退模型逻辑。
- “授权”通过显式手动触发和提交所选记忆来表达，不引入额外 OAuth/权限体系。

## Common Summary
- 目标是在现有长期记忆管理中增加一次性、用户主动触发的“总结生成”能力。
- 当前系统已有用户设置弹窗、长期记忆 CRUD、默认模型解析和通用模型调用能力，但没有记忆来源字段、批量选择能力或总结接口。
- 固定约束是：原始记忆保留；生成结果保存为新记忆；所有记忆仍进入聊天上下文；模型选择走用户默认模型与现有回退逻辑。
- 共享契约是：前端提交一组已选记忆 ID；服务端只读取当前用户拥有的记忆；返回新创建的 `UserMemory` 记录；记录必须带来源字段。
- 依赖顺序是：先稳定数据契约与总结服务，再接入前端多选和触发交互。
- 未决项目前已收敛，无阻塞性产品问题。

## Context Facts
- 长期记忆数据结构定义在 `prisma/schema.prisma:133`，目前只有 `id`、`userId`、`content`、时间戳。
- 记忆 CRUD 服务在 `app/lib/server/user-memory.server.ts:22` 到 `app/lib/server/user-memory.server.ts:139`，当前仅支持按文本创建、更新、删除。
- 记忆列表/编辑 UI 在 `app/routes/chat/layout.tsx:763` 到 `app/routes/chat/layout.tsx:893`，当前无多选、无批量操作。
- 记忆列表 API 在 `app/routes/api/user.memories.ts:25`，单条编辑删除在 `app/routes/api/user.memories.$memoryId.ts:22`。
- 用户设置读模型在 `app/lib/server/user-settings.server.ts:52`，会把 `memories` 原样提供给前端。
- 聊天上下文注入逻辑在 `app/lib/server/chat.server.ts:701` 到 `app/lib/server/chat.server.ts:742`，当前对所有记忆一视同仁。
- 非流式模型调用封装在 `app/lib/server/openai.server.ts:235`，适合本次“输入若干记忆 -> 输出一段总结文本”的单次生成场景。

## Workstreams

### Workstream `memory-summary-data-contract`
- workstream_id: `memory-summary-data-contract`
- recommended_agent: `implementer`
- depends_on: none
- unblocks: `memory-summary-ui-flow`
- critic_review_required: no
- status: implemented
- Scope:
  - 扩展 `UserMemory` schema，新增来源字段，例如 `source`，取值至少支持 `manual | ai_summary`。
  - 更新 memory server types、读写映射和现有 CRUD，使手动新增默认写入 `manual`。
  - 新增“根据指定记忆生成总结并创建记忆”的服务端能力。
  - 新增 API route 处理总结请求、参数校验、ownership 校验、模型解析和错误返回。
- Likely files:
  - `prisma/schema.prisma`
  - `app/lib/server/user-memory.server.ts`
  - `app/lib/server/user-settings.server.ts`
  - `app/lib/server/index.server.ts`
  - `app/lib/server/openai.server.ts`（仅复用，不预期修改）
  - 可能新增 `app/routes/api/user.memories.summary.ts`
- Dependency notes:
  - 先稳定数据字段和服务接口，前端才可以安全消费来源信息和新接口。
- Acceptance slice:
  - 所有返回给前端的 memory 记录都包含来源字段。
  - 现有手动创建、更新、删除流程保持可用。
  - 总结接口只允许读取当前用户所选且归属当前用户的记忆。
  - 成功时返回新创建的 `ai_summary` 记忆；失败时返回明确错误。
- Review evidence:
  - schema diff 与服务层 diff
  - API 参数/ownership/模型回退代码检查
  - 生成 prompt 与输出清洗逻辑的可读性检查

### Workstream `memory-summary-ui-flow`
- workstream_id: `memory-summary-ui-flow`
- recommended_agent: `implementer`
- depends_on: `memory-summary-data-contract`
- unblocks: none
- critic_review_required: no
- status: implemented
- Scope:
  - 在长期记忆列表中加入多选能力和选中状态展示。
  - 增加“生成记忆总结”操作区，明确提示会将所选记忆发送给模型分析。
  - 增加提交前校验、生成中禁用态、成功提示与错误提示。
  - 成功后将返回的新记忆插入列表，并清空本次选择。
  - 在列表中展示记忆来源标识，让用户能看出哪些是 AI 总结生成。
- Likely files:
  - `app/routes/chat/layout.tsx`
  - 如需抽离局部组件，可能新增 `app/components/...`
- Dependency notes:
  - 依赖来源字段与总结接口契约稳定后接入。
- Acceptance slice:
  - 用户可以勾选多条记忆并触发一次总结。
  - 未选择记忆时不可提交。
  - 总结成功后，列表出现新的 `ai_summary` 记忆，原始记忆仍保留。
  - 现有单条编辑/删除流程不被破坏；编辑态与多选态冲突可被合理处理。
- Review evidence:
  - 组件 diff
  - 关键状态流转代码检查
  - 记忆列表在桌面/移动布局下的可用性 spot check

## Shared Contracts
- `UserMemory` read model 扩展为包含来源字段：
  - `id: string`
  - `userId: string`
  - `content: string`
  - `source: 'manual' | 'ai_summary'`
  - `createdAt: Date`
  - `updatedAt: Date`
- 总结请求契约建议为：
  - `POST /api/user/memories/summary`
  - body: `{ memoryIds: string[] }`
- 总结响应契约建议为：
  - success: `{ memory: UserMemory }`
  - failure: `{ error: string }`
- 服务端生成规则：
  - 仅处理当前用户拥有的所选记忆。
  - 若 `memoryIds` 为空、存在越权 ID、或无可用模型，直接返回错误。
  - 模型输出应收敛为一段适合作为长期记忆保存的精炼文本，避免第一人称指令和冗长解释。
- 前端授权表达：
  - 通过显式选择 + 显式点击“生成记忆总结”完成，不额外新增独立权限存储。

## Acceptance Criteria
- `UserMemory` 数据结构支持来源标记，并且现有手动新增记忆自动标记为 `manual`。
- 用户可以在长期记忆列表中勾选一条或多条记忆。
- 用户触发总结时，界面明确说明会将所选记忆发送给模型分析。
- 服务端会基于所选记忆生成一条新长期记忆，来源标记为 `ai_summary`。
- 新记忆创建成功后立即出现在记忆列表中，原始记忆保持不变。
- 现有记忆 CRUD 和聊天上下文注入能力继续可用。
- 错误场景下用户能收到明确反馈，且不会破坏当前编辑和管理流程。

## Review Plan
- 这是一个单链路功能扩展，主风险在于数据契约变更和 UI 状态兼容，不需要先行拆出额外高风险并行任务。
- 实现后优先做代码审查式验证：
  - 检查 schema 与类型映射是否完整传播到 settings read model 和 API 返回。
  - 检查总结接口是否正确做 ownership 校验、空选择校验、模型回退与错误处理。
  - 检查 UI 是否正确处理“编辑单条记忆”和“多选生成总结”的状态边界。
- 若实现过程未引入额外集成风险，后续验证以 targeted code review + 最小必要现有检查为主，不强制新增独立测试工作流。
- **Outcome**: Implementation completed with route type generation/typecheck passing and orchestrator spot-check confirming route registration plus generated route typing for `/api/user/memories/summary`.

## Open Questions
- 暂无阻塞性问题。
- 若实现时发现“编辑态与多选态”存在明显冲突，默认优先保证编辑态独占，并在进入编辑时清空多选或临时禁用批量总结入口；这不改变外部行为目标。
