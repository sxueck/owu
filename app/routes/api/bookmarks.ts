import type { Route } from "./+types/bookmarks";
import { getSession } from "~/sessions";

type CreateBookmarkPayload = {
  sessionId?: unknown;
  messageId?: unknown;
  title?: unknown;
  codeContent?: unknown;
  language?: unknown;
  lineNumber?: unknown;
};

function toCreatePayload(body: CreateBookmarkPayload) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const title = typeof body.title === "string" ? body.title : undefined;
  const codeContent = typeof body.codeContent === "string" ? body.codeContent : "";
  const language = typeof body.language === "string" ? body.language : undefined;
  const lineNumber = typeof body.lineNumber === "number" ? body.lineNumber : undefined;

  return { sessionId, messageId, title, codeContent, language, lineNumber };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { createBookmark } = await import("~/lib/server/bookmark.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const raw = (await request.json()) as CreateBookmarkPayload;
    const payload = toCreatePayload(raw);
    const bookmark = await createBookmark(user, payload);

    return new Response(JSON.stringify({ bookmark }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Failed to create bookmark";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
