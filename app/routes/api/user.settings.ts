import type { Route } from "./+types/user.settings";
import { getSession } from "~/sessions";

/**
 * API endpoint for user settings (default model, personal prompt).
 * GET /api/user/settings - Get all user settings
 * POST /api/user/settings - Save user settings (default model and/or personal prompt)
 */

type SaveSettingsPayload = {
  defaultModelId?: unknown;
  personalPrompt?: unknown;
};

function toSavePayload(body: SaveSettingsPayload) {
  const defaultModelId = body.defaultModelId === null 
    ? null 
    : typeof body.defaultModelId === "string" 
      ? body.defaultModelId 
      : undefined;
  
  const personalPrompt = body.personalPrompt === null 
    ? null 
    : typeof body.personalPrompt === "string" 
      ? body.personalPrompt 
      : undefined;

  return { defaultModelId, personalPrompt };
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookieSession = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getUserSettings } = await import("~/lib/server/user-settings.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const settings = await getUserSettings(user.userId);
    return new Response(JSON.stringify(settings), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
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
  const { saveUserSettings } = await import("~/lib/server/user-settings.server");

  let user;
  try {
    user = requireUser(cookieSession);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const raw = (await request.json()) as SaveSettingsPayload;
    const payload = toSavePayload(raw);
    
    await saveUserSettings(user.userId, payload);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
