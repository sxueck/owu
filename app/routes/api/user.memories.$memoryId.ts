import type { Route } from "./+types/user.memories.$memoryId";
import { getSession } from "~/sessions";

/**
 * API endpoint for individual memory operations.
 * PUT /api/user/memories/:memoryId - Update a memory
 * DELETE /api/user/memories/:memoryId - Delete a memory
 */

type UpdateMemoryPayload = {
  content?: unknown;
};

function validateUpdatePayload(body: UpdateMemoryPayload) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    throw new Error("Content is required");
  }
  return { content };
}

export async function action({ request, params }: Route.ActionArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const memoryId = params.memoryId;
  if (!memoryId) {
    return new Response("Memory ID is required", { status: 400 });
  }

  try {
    switch (request.method) {
      case "PUT": {
        const { updateUserMemory } = await import("~/lib/server/user-memory.server");
        const raw = (await request.json()) as UpdateMemoryPayload;
        const payload = validateUpdatePayload(raw);
        const memory = await updateUserMemory(memoryId, user.userId, payload);
        if (!memory) {
          return new Response(JSON.stringify({ error: "Memory not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ memory }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "DELETE": {
        const { deleteUserMemory } = await import("~/lib/server/user-memory.server");
        const success = await deleteUserMemory(memoryId, user.userId);
        if (!success) {
          return new Response(JSON.stringify({ error: "Memory not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      default:
        return new Response("Method not allowed", { status: 405 });
    }
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
