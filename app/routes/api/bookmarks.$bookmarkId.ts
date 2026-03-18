import type { Route } from "./+types/bookmarks.$bookmarkId";
import { getSession } from "~/sessions";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return new Response("Method not allowed", { status: 405 });
  }

  const bookmarkId = (params as { bookmarkId?: string }).bookmarkId;
  if (!bookmarkId) {
    return new Response("Bookmark ID required", { status: 400 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { deleteBookmark } = await import("~/lib/server/bookmark.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await deleteBookmark(user, bookmarkId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Failed to delete bookmark";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
