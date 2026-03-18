---
slug: chat-network-tool-calling-exa-search
title: Chat network search toggle with Exa tool calling
status: verified
---

## Goal
为 `/chat` 增加一个默认开启的网络 SVG 开关，并把该状态作为用户偏好持久化到独立数据库表。开启时，聊天服务通过 OpenAI Chat Completions API 的原生 `tools/tool_calls` 机制向模型注入 Exa 搜索工具；关闭时则不注册该工具，继续使用现有普通问答流式模式。若 Exa 配置缺失或调用失败，系统自动降级到普通问答，并向用户展示轻量提示。

## Scope
- 新增独立用户偏好表，保存聊天联网开关状态。
- 在 `/chat/:sessionId` 页面 loader 中读取该偏好，无记录时默认开启。
- 在 `/chat` 输入区域增加网络 SVG 开关，并支持切换后持久化到数据库。
- `/chat/:sessionId/stream` 扩展请求参数，传递本次消息的 `networkEnabled`。
- 后端聊天链路增加 `tool_calls` 模式：
  - 开关关闭：沿用现有普通 `chat.completions` 流式回答。
  - 开关开启：向模型注册 Exa 搜索 tool，并在收到 `tool_calls` 时由后端执行 Exa 搜索，再把 tool result 回填给模型生成最终回答。
- 在 `/admin` 下新增独立联网搜索配置模块，用于管理 Exa 配置。
- 当 Exa 未配置、不可用或执行异常时，自动降级为普通问答，并向前端发送提示事件。

## Non-Goals
- 不实现 MCP bridge，不复用 MCP server 作为聊天执行通道。
- 不实现通用多搜索供应商或多工具框架。
- 不实现 prompt-based 假工具调用（例如要求模型输出 JSON 再手动解析）。
- 不把网络偏好做成 session 级配置，本期仅按用户维度保存。
- 不重构现有聊天页面整体布局，只做局部增强。

## Constraints
- 当前聊天链路仅支持普通 `chat.completions` 流式输出，尚未支持 `tool_calls` 循环执行。
- 当前 `openai.server.ts` 仅封装基础 completion / streaming，需要新增工具调用流程封装。
- 当前 `/chat` SSE 事件只有 `start/token/reasoning/complete/suggestions/error`，需要增加非阻断型提示事件。
- 当前仓库没有现成的用户偏好存储结构。
- 当前后台虽然已有 provider/MCP 配置，但联网搜索这次要求是独立 admin 模块，放在 `/admin` 下新增入口与页面。
- Exa 配置属于系统级管理配置，需要与现有 admin 配置风格保持一致。

## Common Summary
本次目标是在现有聊天体验基础上加一个默认开启的"联网搜索"能力。所有执行方共享的关键事实是：聊天 UI 现有模型切换和 SSE 流式渲染必须保持兼容；联网能力通过 OpenAI 原生 `tool_calls` 实现；Exa 由后端直连而不是通过 MCP；用户偏好需要独立表；管理员需要一个新的 `/admin` 独立联网配置模块；任何 Exa 缺失或失败都必须降级到普通问答并提示用户。执行顺序上，先同时稳定两个独立 contract（`user-chat-preferences` 用户偏好与 `exa-search-config-admin` 管理员搜索配置），然后实现 `chat-tool-calling-service` 服务端 tool 调用与降级逻辑，最后接入 `/chat` UI。

## Context Facts
- `app/routes/chat/session.tsx:101` loader 当前只返回 `models/session/messages`，没有用户偏好。
- `app/routes/chat/session.tsx:431` 的 `submitPrompt` 目前只提交 `{ content, model }`。
- `app/routes/chat/session.tsx:768` 附近已有输入区底栏，可容纳网络开关。
- `app/routes/chat/stream.tsx:11` 的 SSE 合同目前没有提示型事件。
- `app/lib/server/chat.server.ts:408` 的 `sendMessageStream` 当前始终走普通 `streamChatCompletion(...)`。
- `app/lib/server/openai.server.ts:179` 当前仅封装普通 streaming chat completions。
- `prisma/schema.prisma` 目前没有用户偏好表。
- `app/routes/admin/mcp.tsx` 和现有 admin 结构说明后台已有配置页风格可参考，但本需求需要新增独立模块。
- 当前仓库没有现成的 chat toast/banner 抽象，前端提示大概率需在 `session.tsx` 内先落一个轻量实现。

## Workstreams

### workstream_id: user-chat-preferences
- recommended_agent: implementer
- status: implemented
- depends_on: none
- unblocks: exa-search-config-admin, chat-tool-calling-service, chat-network-ui
- critic_review_required: yes
- Scope:
  - 在 `prisma/schema.prisma` 中新增独立用户偏好表，至少含 `userId`、`chatNetworkEnabled`、`createdAt`、`updatedAt`。
  - 提供 server-side helper：读取偏好（无记录时默认 `true`）、更新/upsert 偏好。
  - 让 `/chat` loader 可以读取偏好供页面初始渲染使用。
- Acceptance slice:
  - 登录用户总能拿到稳定的 `chatNetworkEnabled: boolean`。
  - 无记录时默认值为 `true`。
  - 结构可容纳未来新增用户聊天偏好。
- Review evidence:
  - Prisma schema diff
  - 偏好 helper diff
  - chat loader 类型与返回值更新

### workstream_id: exa-search-config-admin
- recommended_agent: implementer
- status: implemented
- depends_on: none
- unblocks: chat-tool-calling-service
- critic_review_required: yes
- Scope:
  - 在 `/admin` 下新增独立联网搜索配置模块和页面入口。
  - 新增 Exa 系统配置的读写逻辑，建议包含：
    - `enabled`
    - `apiKey`
    - `baseUrl`（可选）
    - `defaultResultCount`（可选，带默认值）
  - 保持与现有 admin 页面样式和权限校验一致。
- Acceptance slice:
  - 管理员可在独立页面查看并保存联网搜索配置。
  - 未配置 API key 时系统可识别为不可用状态。
  - 页面结构与 `/admin` 现有导航一致。
- Review evidence:
  - admin route diff
  - 配置读写逻辑 diff
  - 权限与表单处理代码审查

### workstream_id: chat-tool-calling-service
- recommended_agent: implementer
- status: verified
- depends_on: user-chat-preferences, exa-search-config-admin
- unblocks: chat-network-ui
- critic_review_required: yes
- Scope:
  - 扩展 chat stream 请求 contract，支持 `networkEnabled`。
  - 在服务端增加模式选择逻辑：
    - 关闭：沿用现有普通流式路径
    - 开启且 Exa 可用：注册 `exa_search` tool 并处理 `tool_calls`
    - 开启但 Exa 不可用：发送 notice 后降级普通路径
  - 新增 Exa 搜索 adapter，由后端执行 Exa 请求并返回工具结果。
  - 完成 `tool_calls` 循环：
    1. 首轮 completion
    2. 识别 tool call
    3. 执行 Exa 搜索
    4. 追加 tool result
    5. 再次 completion 获取最终回答
  - 保持消息保存、reasoning、follow-up questions 的现有行为尽量兼容。
- Acceptance slice:
  - 开关关闭时行为与现有实现等价。
  - 开关开启且 Exa 可用时，模型可以使用 `exa_search`。
  - Exa 不可用/失败时不会中断主回答，会自动降级并发出提示。
- Review evidence:
  - `chat.server.ts` 分支与 fallback diff
  - `openai.server.ts` tool-calling 封装 diff
  - Exa adapter diff
  - stream route / SSE contract 更新

### workstream_id: chat-network-ui
- recommended_agent: implementer
- status: implemented
- depends_on: user-chat-preferences, chat-tool-calling-service
- unblocks: none
- critic_review_required: yes
- Scope:
  - 在 `app/routes/chat/session.tsx` 输入区加入网络 SVG 开关，默认取用户偏好。
  - 用户切换时写回数据库偏好。
  - 发消息时把 `networkEnabled` 带到 SSE stream 请求。
  - 监听新的 `notice` 事件，展示"已自动降级为普通问答"等轻量提示。
  - 不破坏模型切换、发送按钮、streaming 渲染、reasoning 展示与 follow-up 问题。
- Acceptance slice:
  - 网络开关默认开启，且刷新后状态保持。
  - 关闭时不会注册网络工具。
  - 降级提示可见但不打断消息流。
- Review evidence:
  - `session.tsx` UI/state diff
  - 偏好保存交互 diff
  - `notice` 事件消费与提示展示 diff

## Shared Contracts
- 用户偏好 contract:
  - `getUserChatPreferences(userId)` -> `{ chatNetworkEnabled: boolean }`
  - `saveUserChatPreferences(userId, input)` -> upsert 后返回最新偏好
  - 无记录时统一视为 `chatNetworkEnabled = true`
- 联网搜索配置 contract:
  - `getSearchConfig()` -> `{ enabled, apiKeyPresent, baseUrl, defaultResultCount, isConfigured }`
  - `saveSearchConfig(input)` 仅管理员可调用
- 聊天请求 contract:
  - `/chat/:sessionId/stream` POST body 从 `{ content, model }` 扩展为 `{ content, model, networkEnabled? }`
  - 若 body 未传，服务端回落到数据库偏好
- Tool contract:
  - tool name: `exa_search`
  - input schema: `{ query: string }`
  - output: 精简、结构化的搜索结果摘要，适合模型继续生成最终回答
- SSE contract:
  - 保留 `start/token/reasoning/complete/suggestions/error`
  - 新增 `notice`：`{ type: "notice", level: "info" | "warning", message: string }`
  - Exa 不可用或降级走 `notice`，不走 `error`
- Fallback contract:
  - 任一 Exa 配置缺失、网络失败、上游报错、tool 执行异常，都不应中断主回答
  - 降级后继续使用普通流式回答路径，并照常落库 assistant message

## Acceptance Criteria
- `/chat` 输入区新增网络 SVG 开关，默认开启，状态清晰可见。
- 用户偏好保存到独立数据库表，刷新和重新进入页面后状态一致。
- `/admin` 下新增独立联网搜索配置模块，可由管理员配置 Exa 所需参数。
- 开启网络开关时，服务端向模型注册 `exa_search` tool，并通过原生 `tool_calls` 执行联网搜索。
- 关闭网络开关时，服务端不注册该 tool，聊天保持普通问答模式。
- 当 Exa 未配置、不可用或执行失败时，系统自动降级为普通问答，并向用户显示轻量提示。
- 现有模型选择、消息流式体验、reasoning 展示、follow-up questions 不发生明显回归。

## Review Plan
- 先检查数据与配置拆分是否合理：用户偏好和系统级联网配置不能混放。
- 重点审查 `tool_calls` 循环是否真的使用 OpenAI 原生工具调用，而非 prompt 模拟。
- 检查 Exa 失败路径是否总是降级为普通问答，而不是错误中断。
- 检查 `/admin` 新模块是否复用现有权限与表单模式，而不是引入新的管理体系。
- 针对 `networkEnabled` fallback 与 `notice` 降级路径做 targeted review，确保降级行为符合预期。
- 完成后做一次代码级 spot review，重点核对：
  - 新表和 helper 是否与现有 server export 体系一致
  - 请求合同与 SSE 合同前后端是否匹配
  - 是否重复造已有系统配置读取逻辑
  - 是否有不必要的大范围 UI 变动
- **Final execution outcome**: Code review confirmed native OpenAI `tool_calls` handling is used and the admin `enabled` flag now gates Exa availability.

## Open Questions
- Exa 搜索结果返回给模型时的结构化字段需要在实现中定一个"够用但不过度复杂"的格式，建议至少包含 `title`、`url`、`snippet`。
- 如果当前选中的某些模型对 `tool_calls` 支持不稳定，服务端仍按降级策略处理，不阻塞主回答。
- 如 admin 页面需要显示"当前配置是否可用"，可在本期作为轻量状态提示一并完成，但不扩展成复杂健康检查系统。
