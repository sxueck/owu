---
slug: user-settings-modal
title: User Settings Modal with Memory and Personal Prompt
status: approved
---

## Goal
为登录用户提供一个基于模态弹窗的“用户设置”入口，支持管理默认模型、长期记忆、个人 prompt，并让个人 prompt 与记忆在聊天请求中自动注入到模型上下文。

## Scope
- 在聊天侧边栏用户菜单中新增“用户设置”入口，位于主题切换下方。
- 新增用户设置模态弹窗，承载默认模型、长期记忆、个人 prompt 的查看与编辑。
- 扩展用户偏好存储，支持默认模型和个人 prompt。
- 新增用户长期记忆的数据存储与 CRUD。
- 调整新建会话页和聊天页的默认模型初始化逻辑，优先使用服务端用户偏好。
- 在聊天服务端请求组装阶段，将个人 prompt 与长期记忆注入到模型上下文。
- 当用户默认模型失效时，自动回退到当前第一个可用模型，并保持界面可感知。

## Non-Goals
- 不实现记忆自动提取、自动总结、自动合并。
- 不实现复杂记忆结构，如标签、分类、优先级、启用开关、时效控制。
- 不新增独立的“设置页”路由。
- 不改造管理员侧的模型管理逻辑。
- 不引入更多个性化设置项。

## Constraints
- 复用现有用户偏好能力，主落点保持在 `app/lib/server/preferences.server.ts`。
- 默认模型必须来自现有可用模型列表，不能接受自由输入。
- 聊天上下文注入必须与现有联网搜索 system prompt 链路兼容，避免 system prompt 顺序冲突。
- 当前会话手动切换模型仍优先于用户默认模型；默认模型只影响“初始默认值”。
- UI 风格沿用现有聊天页模态和面板视觉语言，主要修改 `app/routes/chat/layout.tsx`。
- 首期记忆为“多条文本项”；个人 prompt 为“单个可编辑文本块 + 系统默认预设回退”。

## Common Summary
- 目标：给每个用户一个统一设置入口，管理默认模型、个人 prompt、长期记忆，并在聊天时自动生效。
- 当前状态：已有 `UserPreference`、已有模型列表、已有聊天模态样式、已有聊天流式发送链路，但无用户级默认模型/记忆/prompt。
- 固定约束：默认模型只能选可用模型；当前会话手动切换优先；记忆与 prompt 为用户隔离数据；聊天注入走服务端。
- 共享契约：设置弹窗读写用户数据；新会话页读取偏好决定默认模型；聊天服务端统一构造用户上下文注入。
- 依赖顺序：先稳定数据模型与服务接口；完成后 `chat-user-context-injection` 与 `default-model-consumption` 可并行启动；`user-settings-modal-ui` 在数据契约完成后启动，但不阻塞默认模型消费。
- 未决项：无新增产品分歧；采用“文本记忆项 + 单个个人 prompt”方案。

## Context Facts
- 用户菜单和现有菜单项位于 `app/routes/chat/layout.tsx:525`。
- 主题切换项已在用户菜单中实现，适合作为“用户设置”入口插入点，见 `app/routes/chat/layout.tsx:558`。
- 新会话默认模型当前依赖浏览器 `localStorage`，位于 `app/routes/chat/index.tsx:73` 和 `app/routes/chat/index.tsx:90`。
- 聊天会话页已有会话级模型切换逻辑，状态位于 `app/routes/chat/session.tsx:665`、`app/routes/chat/session.tsx:751`、`app/routes/chat/session.tsx:1626`。
- 用户偏好当前仅有 `chatNetworkEnabled`，定义在 `prisma/schema.prisma:116` 和 `app/lib/server/preferences.server.ts:3`。
- 聊天历史会被转为 `ChatCompletionMessage[]`，位于 `app/lib/server/chat.server.ts:123`。
- 联网搜索会通过 `system` 消息前置注入，位于 `app/lib/server/chat.server.ts:656` 与 `app/lib/server/chat.server.ts:677`。
- 聊天 SSE 请求入口位于 `app/routes/chat/stream.tsx:46`，核心服务位于 `app/lib/server/chat.server.ts`。

## Workstreams

### Workstream `user-settings-data-contract`
- workstream_id: `user-settings-data-contract`
- recommended_agent: `implementer`
- depends_on: none
- unblocks: `user-settings-modal-ui`, `chat-user-context-injection`, `default-model-consumption`
- critic_review_required: no
- status: approved
- Scope:
  - 扩展 Prisma 数据结构以支持用户默认模型、个人 prompt、长期记忆。
  - 扩展用户偏好服务接口，提供设置读取、保存、默认值回退与模型有效性解析。
  - 提供用户记忆 CRUD 的服务端接口与 ownership 校验。
- Likely files:
  - `prisma/schema.prisma`
  - `app/lib/server/preferences.server.ts`
  - `app/lib/server/index.server.ts`
  - 可能新增 `app/lib/server/user-memory.server.ts`
  - 可能新增用户设置相关 API route
- Acceptance slice:
  - 服务端可一次性返回用户设置视图所需数据：默认模型、个人 prompt、记忆列表、有效模型列表、默认预设 prompt。
  - 可保存默认模型与个人 prompt；可创建、更新、删除记忆。
  - 若默认模型无效，返回回退模型与失效状态信息。
- Review evidence:
  - schema 与服务层 diff
  - API/loader/action 契约代码可读性检查
  - 如仓库已有 Prisma 生成或迁移流程，采用最小必要更新

### Workstream `user-settings-modal-ui`
- workstream_id: `user-settings-modal-ui`
- recommended_agent: `implementer`
- depends_on: `user-settings-data-contract`
- unblocks: `default-model-consumption`
- critic_review_required: no
- status: approved
- Scope:
  - 在侧边栏用户菜单中加入“用户设置”入口。
  - 在聊天布局中实现设置模态弹窗。
  - 在模态中提供三个区域：默认模型选择、个人 prompt 编辑、记忆列表管理。
  - 接入保存、增删改的交互与错误/保存状态反馈。
- Likely files:
  - `app/routes/chat/layout.tsx`
  - 可能新增 `app/components/...` 用户设置局部组件
  - 可能新增设置 API route
- Acceptance slice:
  - 用户可打开/关闭设置模态。
  - 可看到模型下拉、prompt 编辑框、记忆列表和新增/编辑/删除操作。
  - 模型失效时展示回退说明，不阻塞保存其他设置。
- Review evidence:
  - 组件 diff
  - 关键交互代码检查
  - 桌面与移动侧边栏下的布局一致性 spot check

### Workstream `default-model-consumption`
- workstream_id: `default-model-consumption`
- recommended_agent: `implementer`
- depends_on: `user-settings-data-contract`
- unblocks: none
- critic_review_required: no
- status: approved
- Scope:
  - 调整新建聊天页 loader 与初始模型解析，优先使用服务端偏好的默认模型。
  - 保留会话内手动切换优先级，不影响 `chat/session` 的现有模型切换行为。
  - 移除或降级 `localStorage` 作为主来源，使其仅作为非权威辅助或直接废弃。
- Likely files:
  - `app/routes/chat/index.tsx`
  - `app/routes/chat/session.tsx`（如需轻微同步或提示）
  - `app/lib/server/chat.server.ts`
- Acceptance slice:
  - 登录后新建对话默认选中用户偏好模型。
  - 换浏览器、重新登录后仍一致。
  - 当前会话手动切换模型后，该会话继续使用切换后的模型。
- Review evidence:
  - 默认模型初始化代码 diff
  - 服务端来源优先级检查
  - 与会话级模型逻辑无冲突的代码审阅

### Workstream `chat-user-context-injection`
- workstream_id: `chat-user-context-injection`
- recommended_agent: `implementer`
- depends_on: `user-settings-data-contract`
- unblocks: none
- critic_review_required: yes
- status: approved
- Scope:
  - 在聊天服务端为每次请求构建用户上下文注入层。
  - 将“系统默认预设 prompt / 用户自定义 prompt / 用户记忆”组装为稳定的 system-level context。
  - 保证与联网搜索 prompt、工具调用后 synthesis prompt 的顺序兼容。
- Likely files:
  - `app/lib/server/chat.server.ts`
  - 可能新增 prompt builder helper
- Acceptance slice:
  - 普通聊天请求会自动带上个人 prompt 与用户记忆。
  - 联网搜索开启时，注入顺序仍稳定，不造成用户上下文丢失。
  - 当用户未自定义 prompt、无记忆时，仍使用默认预设 prompt，且不会引入空注入噪音。
- Review evidence:
  - prompt 组装函数 diff
  - system/user message 顺序代码审阅
  - 至少一个针对注入结果的轻量验证或可读性明确的构造测试（若仓库已有测试模式则优先沿用）

## Shared Contracts

### User settings read model
服务端向设置 UI 返回统一结构，建议形如：
- `availableModels: Array<{ id, label, providerLabel }>`
- `defaultModel: { selectedModelId: string, fallbackModelId: string | null, isFallback: boolean, invalidStoredModelId?: string | null }`
- `personalPrompt: { value: string, source: "default" | "custom", defaultValue: string }`
- `memories: Array<{ id: string, content: string, createdAt: Date, updatedAt: Date }>` 

### Preference persistence contract
用户偏好至少新增：
- `defaultModelId: string | null`
- `personalPrompt: string | null`
现有：
- `chatNetworkEnabled: boolean`

### Memory contract
首期记忆项：
- `id: string`
- `userId: string`
- `content: string`
- `createdAt: Date`
- `updatedAt: Date`

### Chat injection contract
服务端在发送给模型前构造统一用户上下文：
- 默认预设 prompt 始终存在
- 若用户自定义 prompt 非空，则覆盖默认 prompt 主体或作为替代主体
- 若存在记忆，则追加为 structured memory section
- 联网搜索 prompt 开启时，网络相关 system prompt 仍可位于最前，但必须保留用户上下文注入，不得覆盖

建议注入文本结构：
1. network/tool policy system prompt（仅联网时）
2. user assistant behavior system prompt（默认预设或用户自定义）
3. user memories system prompt（若存在）
4. conversation history

### Failure handling contract
- 默认模型失效：回退到第一个可用模型，并向 UI 暴露 `isFallback`。
- 无可用模型：沿用现有“暂无可用模型”处理。
- 空 personal prompt：使用默认预设。
- 空记忆列表：不注入记忆段落。

## Acceptance Criteria
- 聊天侧边栏用户菜单新增“用户设置”入口，位于主题切换下方。
- 点击后打开模态弹窗，且交互风格与现有模态一致。
- 模态中可编辑默认模型、个人 prompt，并管理多条长期记忆。
- 用户设置刷新后可保留；重新登录或换浏览器后仍生效。
- 新建对话默认使用用户偏好模型；如果该模型被管理员移除，则自动回退到当前第一个可用模型。
- 现有聊天会话中，用户手动切换模型后，该会话继续按会话模型走，不被用户默认模型覆盖。
- 聊天请求会自动使用用户个人 prompt 和记忆。
- 当联网搜索开启时，用户上下文注入与联网 system prompt 能同时生效。
- 所有设置和记忆均按用户隔离，不能跨用户访问。

## Review Plan
- 在首个代码改动前，先做一次轻量方案审查，重点检查：
  - 数据模型是否过度设计
  - prompt 注入顺序是否会与联网搜索链路冲突
  - 默认模型失效回退是否能在 UI 与服务端保持一致
- 代码完成后采用中等风险 review 形态：
  - 先做实现 diff 审阅
  - 再对聊天上下文注入与默认模型消费做定点核查
  - 如仓库已有轻量可运行验证，则仅运行与改动直接相关的最小检查；若环境不适合则以 review-only 说明风险

## Open Questions
- 个人 prompt 采用“自定义内容完全替代默认预设”还是“在默认预设基础上追加用户补充说明”。推荐默认：以“默认预设为基础模板，用户保存的是完整可编辑文本”，这样实现简单且行为可预期。
- 记忆条目首期是否需要排序能力。当前建议不做专门排序，默认按创建/更新时间展示。
