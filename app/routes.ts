import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // Public routes
  index("routes/auth/login.tsx"),
  route("login", "routes/auth/login-page.tsx"),
  route("register", "routes/auth/register.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  
  // Protected user routes
  route("chat", "routes/chat/layout.tsx", [
    index("routes/chat/index.tsx"),
    route("notion-space", "routes/chat/notion-space.tsx"),
    route(":sessionId", "routes/chat/session.tsx"),
    route(":sessionId/stream", "routes/chat/stream.tsx"),
  ]),
  
  // Admin routes
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/overview.tsx"),
    route("providers", "routes/admin/providers.tsx"),
    route("mcp", "routes/admin/mcp.tsx"),
    route("search", "routes/admin/search.tsx"),
    route("models", "routes/admin/models.ts"),
  ]),

  // API routes
  route("api/preferences/network", "routes/api/preferences.network.ts"),
  route("api/bookmarks", "routes/api/bookmarks.ts"),
  route("api/bookmarks/:bookmarkId", "routes/api/bookmarks.$bookmarkId.ts"),
  
  // User settings routes
  route("api/user/settings", "routes/api/user.settings.ts"),
  route("api/user/memories", "routes/api/user.memories.ts"),
  route("api/user/memories/:memoryId", "routes/api/user.memories.$memoryId.ts"),
  route("api/user/memories/summary", "routes/api/user.memories.summary.ts"),
] satisfies RouteConfig;
