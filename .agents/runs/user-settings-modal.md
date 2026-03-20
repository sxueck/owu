# Runbook: user-settings-modal

- Spec path: `.agents/specs/user-settings-modal.md`
- Shared status: partial_verified
- Current focus: 实现已完成并通过主要复核，剩余事项是处理工作区内与本需求无关的改动边界和迁移落地确认

## Workstream Assignments

- `user-settings-data-contract`: assigned `implementer`, status `completed`, attempts `3`
- `user-settings-modal-ui`: assigned `implementer`, status `completed`, attempts `1`
- `default-model-consumption`: assigned `implementer`, status `completed`, attempts `1`
- `chat-user-context-injection`: assigned `implementer`, status `completed`, attempts `2`

## Dependency State

- 先执行 `user-settings-data-contract`，稳定用户设置和记忆的数据结构、服务端接口与回退规则
- 数据契约完成后，`chat-user-context-injection` 与 `default-model-consumption` 可并行启动；两者均只依赖数据契约，不依赖 UI
- `user-settings-modal-ui` 在数据契约完成后启动，但不阻塞默认模型消费
- 若默认模型被管理员移除，统一回退到当前第一个可用模型，并在 UI 中暴露回退状态

## Validation Expectations

- 默认以代码审查为主
- 若仓库已有便宜且直接相关的检查命令，则运行最小必要检查
- 若 Prisma / 数据库环境受限，则优先保留 schema 与代码审查结论，并明确环境阻塞点
- 对 prompt 注入顺序与默认模型来源优先级做重点核查

## Open Risks

- `chat.server.ts` 已有联网搜索与工具调用的 system prompt 组装逻辑，本次加入用户 prompt / 记忆后需要避免 prompt 顺序漂移
- `chat/index.tsx` 当前使用 localStorage 作为默认模型来源，本次切换为服务端偏好时要避免和现有会话模型逻辑产生双来源冲突
- 设置模态很可能同时承载多种保存动作，需要避免 layout route 中 action/loader 变得过度耦合
- Prisma schema 变更可能需要 migration / generate，取决于当前环境是否允许；路由接入问题已修复
- **返修发现的问题**:
  - `saveUserSettings` 尚未在服务端校验 `defaultModelId` 是否属于当前可用模型列表
  - 当用户没有自定义 prompt 且没有记忆时，默认预设 prompt 当前不会注入聊天上下文，与批准 spec 不一致
- **review-only 发现的新增事项**:
  - 存在与本 spec 无关的工作区改动：`app/routes/chat/notion-space.tsx`、`app/routes/chat/session.tsx`，需在提交/合并前确认是否拆分
  - `app/lib/server/user-settings.server.ts` 中 `getUserSettings` 与 `resolveUserDefaultModel` 存在一次低风险重复查询，可后续顺手收敛
  - Prisma schema 已变更但未生成 migration 工件，落地需结合环境确认

## Retry History

- 首次实现经 orchestrator spot-check 发现路由注册与 memory endpoint 形态不完整，因此发起同工作流定向返修
- 最终 spot-check 发现数据契约与聊天注入各有一个行为偏差，因此发起定向返修

## Files Touched

- `.agents/specs/user-settings-modal.md`
- `.agents/runs/user-settings-modal.md`
- `prisma/schema.prisma`
- `app/lib/server/preferences.server.ts`
- `app/lib/server/user-memory.server.ts`
- `app/lib/server/user-settings.server.ts`
- `app/lib/server/index.server.ts`
- `app/routes/api/user.settings.ts`
- `app/routes/api/user.memories.ts`
- `app/routes/api/user.memories.$memoryId.ts`
- `app/routes.ts`

## Checks Run

- `rtk prisma generate`
- `rtk tsc --noEmit --project app/tsconfig.json`
- `rtk prettier --check`
- `rtk tsc --noEmit --skipLibCheck`
- `review-only verifier pass with partial findings`

## Blocked Items

- 无

## Notes

- 计划已获用户批准，已开始代码实现
- 已开始首个实现批次：user-settings-data-contract
- Planning review 已完成；未使用 critic 结论是因为 critic 子代理两次返回空结果，归类为 `model_error`，因此由 orchestrator 做了人工顺序审查
- 首个实现批次应先完成数据契约，再根据结果决定后续并行性
- 在开始代码实现前，建议先做一次轻量顺序审查，确认 prompt 注入与默认模型来源不会互相打架
- **返修发现的问题**:
  - 新增的 `user.settings` / `user.memories` API route 尚未接入 `app/routes.ts`，当前前端无法访问
  - 记忆更新/删除设计上需要显式动态路由（如 `api/user/memories/:memoryId`）或统一 query/body 契约，当前实现与注释声明不一致
- data-contract 已完成并通过 spot-check；下一批按不重叠代码区域并行推进
- 最终行为偏差已修正：默认模型服务端校验已补齐
- 最终行为偏差已修正：默认预设 prompt 会注入聊天上下文
- 当前进入最终 review-only 复核阶段
- 最终 review 结论为 partial，主功能已完成，剩余为范围边界与发布落地注意事项
