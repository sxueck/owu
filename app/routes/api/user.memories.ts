import type { Route } from "./+types/user.memories";
import { getSession } from "~/sessions";

/**
 * API endpoint for user memory list and create operations.
 * GET /api/user/memories - Get all user memories
 * POST /api/user/memories - Create a new memory
 * 
 * Individual memory operations (PUT/DELETE) are handled by:
 * /api/user/memories/:memoryId -> user.memories.$memoryId.ts
 */

type CreateMemoryPayload = {
  content?: unknown;
};

function validateCreatePayload(body: CreateMemoryPayload) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    throw new Error("Content is required");
  }
  return { content };
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getUserMemories } = await import("~/lib/server/user-memory.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const memories = await getUserMemories(user.userId);
    return new Response(JSON.stringify({ memories }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load memories";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { createUserMemory } = await import("~/lib/server/user-memory.server");
    const raw = (await request.json()) as CreateMemoryPayload;
    const payload = validateCreatePayload(raw);
    const memory = await createUserMemory(user.userId, payload);
    return new Response(JSON.stringify({ memory }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Operation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
