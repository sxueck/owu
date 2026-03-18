import type { Route } from "./+types/preferences.network";
import { getSession } from "~/sessions";

/**
 * API endpoint for saving user network preferences.
 * POST /api/preferences/network
 * Body: { chatNetworkEnabled: boolean }
 */

export async function action({ request }: Route.ActionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { saveUserChatPreferences } = await import("~/lib/server/index.server");

  // Verify authentication
  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse request body
  try {
    const body = await request.json();
    const chatNetworkEnabled = typeof body.chatNetworkEnabled === "boolean" 
      ? body.chatNetworkEnabled 
      : true;

    await saveUserChatPreferences(user.userId, { chatNetworkEnabled });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
