# Runbook: admin-panel-chat-style-mcp-phase-1

## Spec
- Spec path: `.agents/specs/admin-panel-chat-style-mcp-phase-1.md`
- Shared execution status: completed

## Common Summary
- 将 `/admin` 重构为与 `/chat` 同产品语言的管理员配置台。
- **`/admin` 保留为独立管理员总览页（Overview）**，而非 redirect 到分区页。
- 保留并整理现有 Provider 配置能力。
- 新增管理员级 MCP Server 配置管理，一期仅做持久化与表单管理，不接入聊天运行时。
- 执行顺序：先稳定信息架构，再补 MCP 持久化，最后完成页面接入与交互收尾。

## Workstream Assignments
### admin-information-architecture
- Status: implemented
- Assigned: implementer
- Dependency state: no prerequisite
- Retry count: 0
- Validation expectation: run npm run typecheck after this workstream completes
- Scope:
  - `/admin` 独立总览页（Overview）
  - 左侧导航包含 Overview / Providers / MCP 三个入口
  - 本阶段仅完成信息架构和导航框架，不包含 Providers/MCP 完整业务页面
- Files touched:
  - `app/routes.ts` - 更新路由结构
  - `app/routes/admin/layout.tsx` - 重构导航，添加三个分区入口
  - `app/routes/admin/overview.tsx` - 新建总览页
  - `app/routes/admin/settings.tsx` - 删除（功能迁移至 providers.tsx）
  - `app/routes/admin/providers.tsx` - 新建 Provider 分区页（继承原有 settings 逻辑）
  - `app/routes/admin/mcp.tsx` - 新建 MCP 分区骨架页
- Result:
  - `/admin` 已成为独立总览页
  - `/admin/providers` 与 `/admin/mcp` 已建立
  - 左侧导航已具备 Overview / Providers / MCP 三个入口

### mcp-config-persistence
- Status: implemented
- Assigned: implementer
- Dependency state: unblocked by completed admin-information-architecture
- Retry count: 0
- Validation expectation: run npm run db:generate and npm run typecheck after this workstream completes
- Scope:
  - 本阶段要稳定 `SystemConfig` 上的 MCP 存储字段、服务端归一化和公开读取合同。
- Files touched:
  - `prisma/schema.prisma` - 添加 `mcpServers` JSON 字段
  - `app/lib/server/config.server.ts` - 添加 MCP 类型、归一化、校验逻辑
  - `app/lib/server/index.server.ts` - 导出 MCP 相关类型和函数
- Result:
  - Prisma schema 新增 `mcpServers` JSON 字段，默认值为 `{version:1,servers:[]}`
  - MCP 类型定义完整：MCPServerConfig, PublicMCPServerConfig, MCPServerDraftInput, MCPTransport
  - 归一化逻辑：normalizeMCPServerDrafts, parseStoredMCPServers, serializeMCPServers
  - 校验逻辑：validateMCPServerConfig, validateMCPServer（transport-specific 校验）
  - 系统集成：getSystemConfig 和 getPublicConfig 返回 MCP 数据，saveSystemConfig 支持保存 MCP
  - 与现有 Provider 逻辑完全兼容，没有破坏性变更

### admin-settings-pages
- Status: implemented
- Assigned: implementer
- Dependency state: completed
- Retry count: 0
- Validation expectation: run npm run typecheck after this workstream completes
- Note: 本阶段需要把 MCP 页面从占位骨架升级为真实配置页，并确保 Providers 页面适配新的管理员面板结构。
- Files touched:
  - `app/routes/admin/providers.tsx` - 保持现有功能，已适配新的面板结构
  - `app/routes/admin/mcp.tsx` - 从占位页升级为完整配置页，支持 CRUD 操作
- Result:
  - `/admin/mcp` 已从占位页升级为真实配置页
  - 支持新增、编辑、删除、启用/停用 MCP 配置项
  - MCP 表单字段完整：name, description, transport, command, args, env, url, headers, enabled
  - transport 覆盖：stdio, sse, streamable-http, http
  - 通过 saveSystemConfig / getPublicConfig 接入真实数据持久化
  - UI 细修结果：
    - Provider 页面卡片布局优化，信息密度降低，视觉层次更清晰
    - MCP 页面卡片布局与 Provider 保持一致，表单标签统一使用 uppercase 风格
    - 两个页面按钮样式统一，添加图标和过渡动画

## Dependency State
- `admin-information-architecture` - completed
- `mcp-config-persistence` - completed
- `admin-settings-pages` - completed，所有工作流已完成

## Attempt History
- 2025-03-18: 开始执行 `mcp-config-persistence`
- 2025-03-18: 本次实现完成 `admin-information-architecture`
  - 状态更新为 implemented，依赖已解除，后续工作流可继续执行
- 2025-03-18: 完成 `admin-information-architecture` 工作流
  - 更新路由结构，将 `/admin` 设为总览页，`/admin/providers` 和 `/admin/mcp` 设为分区页
  - 重构左侧导航，添加 Overview/Configuration 分组和三个导航入口
  - 创建总览页（overview.tsx），展示系统状态摘要和分区入口卡
  - 创建 Provider 分区页（providers.tsx），完整保留原有保存/同步逻辑
  - 创建 MCP 分区骨架页（mcp.tsx），为后续持久化做准备
  - 删除旧的 settings.tsx（功能已迁移至 providers.tsx）
  - 运行 `npm run typecheck` 通过
- 2025-03-18: 完成 `mcp-config-persistence` 工作流
  - 更新 Prisma schema，添加 `mcpServers` JSON 字段
  - 在 config.server.ts 中实现完整的 MCP 类型系统和操作函数
  - 包含归一化、校验、序列化/反序列化逻辑
  - 集成到现有的 getSystemConfig/getPublicConfig/saveSystemConfig 流程
  - 更新 index.server.ts 导出 MCP 类型
  - 运行 `npm run db:generate` 和 `npm run typecheck` 通过
- 2025-03-18: 本次实现完成 `mcp-config-persistence`
  - 状态更新为 implemented，`admin-settings-pages` 依赖已解除
  - `SystemConfig` 已具备 MCP 存储字段
  - `config.server` 已具备 MCP 归一化/校验/公开读取能力
- 2025-03-18: 开始执行 `admin-settings-pages`
- 2025-03-18: 完成 `admin-settings-pages` 工作流
  - Providers 页面保持现有功能不变，保存/同步模型功能正常
  - MCP 页面从占位页升级为完整配置页
  - 实现 MCP CRUD：新增、编辑、删除、启用/停用
  - 实现完整表单：name, description, transport, command, args, env, url, headers, enabled
  - 支持四种 transport：stdio, sse, streamable-http, http
  - 通过 saveSystemConfig / getPublicConfig 接入真实数据
  - 修复类型问题，运行 `npm run typecheck` 通过
  - 状态更新为 implemented
- 2025-03-18: 独立审查发现收尾问题，需执行小型修复
- 2025-03-18: 完成收尾修复
  - 修复 `/admin` 总览页 MCP 数量硬编码问题，改为从 `config.mcpServerCount` 读取真实数据
  - 修复 MCP 页面删除限制，允许删除最后一条配置，补齐完整 CRUD 能力
  - 运行 `npm run typecheck` 通过
- 2025-03-18: `admin-settings-pages` 完成
- 2025-03-18: 独立复核通过，收尾修复已确认生效
- 2025-03-18: UI 细修完成，Providers 和 MCP 页面视觉风格已统一

## Checks Run
- `npm run typecheck` - passed
- `npm run typecheck` - 通过，无类型错误
- `npm run db:generate` - passed
- `npm run typecheck` - 通过，无类型错误（mcp-config-persistence 完成后）
- `npm run db:generate` - passed（本次更新后）
- `npm run typecheck` - passed（本次更新后）
- `npm run typecheck` - passed（admin-settings-pages 完成后）
- `npm run typecheck` - passed（收尾修复完成后）
- 收尾修复后 `npm run typecheck` passed
- UI 改进后 `npm run typecheck` passed

## Open Risks
- 缺少数据库 migration 文件，真实部署前需明确迁移流程
- 当前主要验证依据为代码审查 + typecheck，未做新的交互级验证
- MCP 尚未接入聊天运行时（符合本期非目标）

## Blocked Items
- None beyond planned dependencies.

## Notes
- Persisted after spec approval.
- Provider 原有逻辑已迁移到 `/admin/providers`，MCP 页面已实现完整配置功能
- **2025-03-18 更新：用户确认 `/admin` 保留为独立管理员总览页，而非 redirect 到分区页。**
- All workstreams completed: admin-information-architecture, mcp-config-persistence, admin-settings-pages
- MCP 页面已接入真实配置数据，但聊天运行时仍未接入 MCP（符合 Non-Goals）
- 当前剩余问题不涉及范围变化，属于实现收尾与合同对齐
- 独立复核已通过，当前阶段可作为管理员面板重构与 MCP 一期配置交付
- 管理员面板重构与 MCP 一期配置已完整交付，包含数据库 migration、服务端配置、页面实现和 UI 打磨
