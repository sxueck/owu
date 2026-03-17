import type { Route } from "./+types/stream";
import { getSession } from "~/sessions";

type SSEEvent =
  | { type: "start"; sessionId: string; model: string }
  | { type: "token"; content: string }
  | { type: "complete"; messageId: string; content: string }
  | { type: "error"; message: string };

/**
 * SSE Stream endpoint for chat messages.
 * 
 * Contract:
 * - POST request returns text/event-stream
 * - Events: start, token, complete, error
 * - User message is saved before streaming starts
 * - Assistant message is only saved after successful completion
 */

function serializeSSE(event: SSEEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

export async function action({ request, params }: Route.ActionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { sendMessageStream } = await import("~/lib/server/chat.server");
  
  // Verify authentication
  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return new Response("Session ID required", { status: 400 });
  }

  // Parse request body
  let content: string;
  let model: string | undefined;
  try {
    const body = await request.json();
    content = body.content;
    model = typeof body.model === "string" ? body.model : undefined;
    if (!content || typeof content !== "string" || content.trim() === "") {
      return new Response("Message content is required", { status: 400 });
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await sendMessageStream(
          user,
          { sessionId, content: content.trim(), model },
          async (event) => {
            const sseData = serializeSSE(event);
            controller.enqueue(encoder.encode(sseData));
          }
        );
        controller.close();
      } catch (error) {
        // Ensure error is sent to client before closing
        // This handles cases where sendMessageStream throws before sending an error event
        const errorMessage = error instanceof Error ? error.message : "Stream failed";
        const errorEvent: SSEEvent = { type: "error", message: errorMessage };
        controller.enqueue(encoder.encode(serializeSSE(errorEvent)));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
