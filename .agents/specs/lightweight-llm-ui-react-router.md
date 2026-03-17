---
slug: lightweight-llm-ui-react-router
title: 轻量化 LLM UI 首期 MVP（React Router + MySQL + Docker）
status: approved
---

## Goal

基于 `React Router + React + MySQL + Docker` 从零搭建一个轻量化自有 LLM UI 首期 MVP，完成：
1. 用户注册 / 登录 / 登出
2. 管理员配置 OpenAI 访问参数
3. 管理员设置全局允许使用的模型列表
4. 登录用户进入基础 Chat UI 发起对话
5. 聊天时仅允许选择并调用管理员开放的模型

## Scope

本期包含：
- 新建 React Router 全栈项目骨架
- Docker 化本地依赖，至少包含 `MySQL`
- 数据库 schema、迁移、初始化 seed
- 本地账号密码认证
- 基础 RBAC：`admin` / `user`
- 管理员设置页：
  - OpenAI API Key
  - OpenAI Base URL（可选，默认官方）
  - 全局模型白名单
- 用户侧页面：
  - 注册页
  - 登录页
  - 基础 Chat UI 页
- 聊天会话与消息持久化
- 服务端调用 OpenAI Chat 能力，并通过 SSE 向前端返回流式回复
- 路由保护与最小错误处理

## Non-Goals

本期不包含：
- 完整复刻 OpenWebUI 的所有交互能力
- 多模型服务商（如 Anthropic、Gemini、Azure OpenAI）
- 文件上传、知识库、RAG、工具调用、工作流
- 团队/组织级权限体系
- OAuth / SSO / 邮箱验证 / 忘记密码
- 多租户隔离
- 流式输出优化以外的高级前端体验（如代码块增强、消息编辑、多分支对话）
- 审计日志、限流、计费、配额系统

## Constraints

- 当前仓库无业务代码，需要从零搭建应用实现
- 技术栈固定为 `React Router + React + MySQL + Docker`
- 首期以 MVP 为目标，优先交付完整主链路而非大而全能力
- 需要保留后续扩展空间：
  - provider 扩展
  - 模型策略扩展
  - 聊天能力增强
- 敏感配置（如 OpenAI API Key）不能明文暴露给浏览器
- 聊天请求必须由服务端校验模型是否在管理员允许列表中
- 管理员设置页中的 API Key 语义必须与页面文案一致，不允许出现"空提交保留旧值"的隐式行为

## Common Summary

- 目标是先完成一个可运行的自有 LLM UI MVP，而不是复刻完整 OpenWebUI。
- 当前仓库仅有 planning artifacts，无业务代码，因此采用从零初始化方案。
- 应用采用 React Router 全栈模式，服务端逻辑主要落在路由 `loader/action` 与服务层。
- 认证采用本地账号密码登录；管理员账号通过 seed 初始化创建。
- 权限仅分 `admin` 与 `user` 两类。
- OpenAI 配置和模型白名单由管理员统一维护，聊天时服务端做最终校验。
- 依赖顺序为：项目骨架与基础设施 -> 数据模型与认证 -> 管理员配置能力 -> Chat 主链路 -> 收尾验证。
- 当前未决项很少，默认按 Prisma 作为 ORM、cookie session 作为登录态方案推进。
- 管理员配置中的 API Key 按显式提交语义处理，页面提示和保存行为必须一致。
- 聊天主链路采用 SSE 流式输出，assistant 消息在流完成后再持久化。

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
  - `complete`: 流完成，包含最终 assistant message 元信息（至少 messageId 或可触发刷新所需标识）
  - `error`: 可读错误信息
- 数据持久化顺序必须是：
  1. 用户消息先入库
  2. assistant 内容仅在 SSE 流完成后持久化完整消息
  3. 若上游失败或中断，不写入伪造 assistant 成功消息

## Context Facts

已由仓库证实：
- 当前目录目前仅包含 planning artifacts，尚无业务实现代码
- 当前已初始化为 git 仓库，但尚无有效业务提交
- 不存在已有前后端、Docker、数据库或认证基础设施可复用

已由技术资料与常规实现方式支撑：
- React Router framework mode 支持服务端 `loader/action`、表单提交、SSR/全栈路由
- 适合把登录、注册、管理配置、聊天提交都放在路由模块和服务层中实现
- MySQL + Prisma 是低阻力、可迁移、适合 MVP 的组合
- 账号密码认证可采用服务端校验 + HttpOnly cookie session

当前仍不确定但不阻塞首期实现：
- OpenAI API 具体使用 `Responses API` 还是兼容的 chat 接口
- UI 是否需要更强的 OpenWebUI 风格复刻程度（本期默认"相似布局与交互心智"，不是像素级复刻）

已确认的事实：
- 首期聊天输出已确定为 SSE 流式响应

## Workstreams

### Workstream: foundation-bootstrap
- `workstream_id`: `foundation-bootstrap`
- `recommended_agent`: `implementer`
- `status`: approved
- `depends_on`: none
- `unblocks`: `auth-and-data-model`
- 目标：
  - 初始化 React Router 项目
  - 建立目录结构、环境变量约定、基础 UI 框架、Docker / docker-compose
  - 接入 Prisma 与 MySQL 基础连接
  - 固定项目初始化方式、package manager、Node 版本、运行脚本与 server-only 模块边界
- 交付内容：
  - 项目脚手架
  - `Dockerfile` / `docker-compose.yml`
  - `.env.example`
  - Prisma 初始化
  - 基础 layout、路由入口、样式系统
  - package manager / Node 版本约定
  - 开发、构建、迁移、seed 命令入口
  - 最小环境变量合同
  - server-only 模块边界约定
- 接受切片：
  - 项目可启动
  - MySQL 容器可启动
  - 应用可连通数据库
  - 后续 workstream 可基于固定脚手架、命令入口和 env contract 继续实现
- Review evidence：
  - 代码结构与配置文件 diff
  - 必要时最小启动检查
- Critic review：
  - 需要。因为它会决定后续目录结构、session 方案与运行方式。

### Workstream: auth-and-data-model
- `workstream_id`: `auth-and-data-model`
- `recommended_agent`: `implementer`
- `status`: approved
- `depends_on`: `foundation-bootstrap`
- `unblocks`: `admin-settings`, `chat-core`
- 目标：
  - 建立用户、会话、系统配置、聊天会话、聊天消息的数据模型
  - 实现注册、登录、登出、路由鉴权、管理员鉴权
  - 锁定 `SystemConfig` 的 singleton 表达方式，以及聊天归属与访问控制约束
- 交付内容：
  - Prisma schema 与迁移
  - seed 管理员账号
  - 注册页 / 登录页 / 登出动作
  - session cookie 与鉴权 helpers
  - 统一的 auth helper、config accessor、ownership/access helper
- 接受切片：
  - 普通用户可注册并登录
  - 管理员账号可登录
  - 受保护路由对未登录用户跳转
  - 管理员路由拒绝普通用户访问
  - `SystemConfig` 的唯一配置模型已固定
  - 聊天归属校验 helper 可供后续 workstream 复用
- Review evidence：
  - schema 与 auth 代码 diff
  - 最小认证流程检查
- Critic review：
  - 依赖 foundation 后可直接执行，不需单独再开并行。

### Workstream: admin-settings
- `workstream_id`: `admin-settings`
- `recommended_agent`: `implementer`
- `status`: approved
- `depends_on`: `auth-and-data-model`
- `unblocks`: `chat-core`
- 目标：
  - 实现管理员配置 OpenAI 参数与模型白名单
  - 提供配置读取与服务端校验逻辑
  - **API Key 表单语义：保存时必须提供非空 API Key，本期不支持 preserve/clear 隐式语义**
- 交付内容：
  - 管理后台设置页
  - 配置保存 action
  - 服务端读取配置的 service/repository
  - 模型白名单校验逻辑
  - 必须复用共享 config contract，不得引入第二套配置读取或白名单校验逻辑
- 接受切片：
  - 管理员可保存 API Key、Base URL、模型列表（API Key 必须非空）
  - 普通用户不可访问该页面
  - 聊天服务可读取当前有效配置
  - 严格复用统一 config accessor / whitelist contract
- Review evidence：
  - 设置页与服务层 diff
  - 关键配置流转代码审阅
- Critic review：
  - 若数据模型已稳定，可不额外阻塞。

### Workstream: chat-core
- `workstream_id`: `chat-core`
- `recommended_agent`: `implementer`
- `status`: approved
- `depends_on`: `auth-and-data-model`, `admin-settings`
- `unblocks`: `ui-polish-and-hardening`
- 目标：
  - 构建类似 OpenWebUI 的基础聊天页面
  - 实现会话列表、消息展示、发送消息、SSE 流式调用 OpenAI、消息持久化
  - 仅在 `admin-settings` 完成并稳定 config accessor 与 whitelist helper 后启动，不使用临时 mock config 路径
  - **SSE 合同：使用 POST 建立 `text/event-stream`，前端通过 fetch 读取 SSE，不采用 EventSource GET**
- 交付内容：
  - Chat 页面及布局
  - 新建会话
  - 消息列表展示
  - 发送消息 action
  - OpenAI 调用服务
  - **SSE endpoint：POST 请求返回 `text/event-stream`，前端通过 `fetch` + `ReadableStream` 消费**
  - 服务端模型白名单校验
  - 复用已稳定的 config accessor 与 whitelist helper，不引入临时 mock
- 接受切片：
  - 登录用户可发起会话并看到历史消息
  - 用户发送消息后可实时看到 assistant 流式输出
  - 流结束后 assistant 回复入库
  - 流失败时不写入伪造成功消息
  - 用户仅能使用管理员开放模型
- Review evidence：
  - 聊天路由与服务层 diff
  - 针对模型校验和消息持久化的代码审阅
  - 如成本可控，可做一次最小集成检查
- Critic review：
  - 若前面 workstream 的共享 contract 已稳定，可单线推进。

### Workstream: ui-polish-and-hardening
- `workstream_id`: `ui-polish-and-hardening`
- `recommended_agent`: `builder`
- `status`: approved
- `depends_on`: `chat-core`
- `unblocks`: none
- 目标：
  - 收敛 MVP 体验，补足关键错误态、空态、表单反馈与基础视觉一致性
- 交付内容：
  - 登录/注册/聊天页的一致化 UI
  - OpenWebUI 风格的基础两栏或单栏聊天布局
  - 错误提示、加载态、空会话态
  - 最小 README 运行说明
- 接受切片：
  - 首次进入有清晰路径
  - 关键表单有错误反馈
  - 聊天界面在桌面与移动端都可用
- Review evidence：
  - UI diff
  - 运行说明与关键页面代码审阅
- Critic review：
  - 一般不需要单独阻塞。

## Shared Contracts

1. 用户与权限
- `User.role` 至少包含 `admin` 与 `user`
- 只有 `admin` 可写系统配置
- 普通用户只能访问自己的聊天数据

2. 系统配置
- 系统中只存在一套当前生效的 LLM provider 配置（首期单 provider：OpenAI）
- 配置至少包含：
  - `apiKey`
  - `baseUrl`（可空，空则走默认）
  - `allowedModels`（数组或等价结构）
- 所有聊天请求必须在服务端读取这套配置，不信任前端传值
- `SystemConfig` 采用单例/唯一记录语义，由统一 accessor 读取
- `allowedModels` 的持久化表示由 `auth-and-data-model` 锁定，后续功能必须复用

3. API Key Contract（已锁定）
- **非空显式提交**：管理员每次保存设置时必须显式提交一个非空 API Key
- **无 preserve 隐式语义**：不支持"留空保留旧值"
- **无 clear 隐式语义**：不提供"留空表示清空"的隐式语义
- **显式覆盖**：若未来需要清空或轮换，通过显式覆盖新值处理
- 表单验证必须在服务端强制执行非空校验

4. Streaming Contract（已锁定）
- **Endpoint Method**：流式聊天使用 `POST` 请求
- **Content-Type**：返回 `text/event-stream`
- **不使用 EventSource GET**：前端通过 `fetch` + `ReadableStream` 消费 SSE 事件流，不采用 `EventSource` 两阶段方案
- **路由格式**：`/chat/:sessionId/stream` 或等价 server endpoint，单次 POST 建立流
- **SSE Event Types**：
  - `start`：告知流开始，可包含 sessionId/model
  - `token`：增量文本片段
  - `complete`：流完成，包含最终 assistant message 元信息（至少 messageId 或可触发刷新所需标识）
  - `error`：可读错误信息
- **Persistence Rules**：
  1. 用户消息先入库
  2. assistant 内容仅在 SSE 流完成后持久化完整消息
  3. 若上游失败或中断，不写入伪造 assistant 成功消息
- **Error Rules**：
  - 流中断或上游错误时通过 SSE `error` 事件返回可读错误
  - 不写入部分或不完整的 assistant 消息到数据库

5. 聊天约束
- 创建消息时必须校验：
  - 用户已登录
  - 会话归属正确
  - 模型在白名单中
  - OpenAI 配置完整
- 消息持久化顺序默认：
  - 用户消息先入库
  - assistant 内容通过 SSE 流式返回前端
  - 仅在流完成后持久化 assistant 完整消息
- 若上游调用失败，需向用户返回可读错误，不写入伪造 assistant 成功消息
- 若上游失败，不写入伪造 assistant 成功消息
- 聊天会话、消息与用户归属关系由统一 helper 校验，避免各路由重复实现

6. 认证
- 采用服务端 session cookie
- 浏览器不持有可直接调用 OpenAI 的秘钥
- 受保护页面在服务端完成鉴权和重定向

## Acceptance Criteria

- 使用 `Docker` 可启动 MySQL，本地开发环境可运行应用
- 首次初始化后存在一个可登录的管理员账号
- 用户可以注册、登录、登出
- 管理员可以维护 OpenAI API Key、Base URL、允许模型列表
- **管理员保存设置时必须提供非空 API Key**
- 登录用户可以进入聊天页、新建会话、发送消息、查看历史
- 聊天时只允许选择管理员开放的模型
- 用户不能访问其他用户的聊天记录
- 普通用户不能访问管理员设置页
- 主要配置和聊天数据持久化到 MySQL
- 管理员设置页中的 API Key 提示与保存行为一致
- **聊天流式输出使用 POST + SSE 协议并能实时显示 token**
- 聊天页面支持 SSE 流式回复显示
- 流式完成后 assistant 消息成功持久化

## Review Plan

默认采用"小步实现 + 代码审阅为主"的验证策略：
1. 在第一批代码变更前先检查任务边界和依赖顺序是否合理
2. 基础设施完成后确认：
   - 项目结构是否可支撑后续扩展
   - 数据库连接与环境变量约定是否清晰
3. 认证与数据模型完成后确认：
   - schema 是否避免重复字段和职责混乱
   - session 与角色校验是否集中管理
4. 聊天主链路完成后确认：
   - 是否复用已有服务与 helper
   - 是否存在模型校验绕过
   - 是否出现不必要的前后端职责重复
5. 最终做一次整体验收性代码审阅；如实现过程中出现跨 workstream 风险，再追加独立 review gate

## Open Questions

- 管理员模型白名单的录入方式默认采用"逗号分隔 / 多行文本转数组"的简单表单，而不是复杂可视化模型管理器。
- OpenAI 配置默认按单环境全局唯一配置处理，不做版本化与多套切换。
