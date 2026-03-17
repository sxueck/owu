import type { Route } from "./+types/models";
import { getSession } from "~/sessions";

type ActionResult =
  | { success: true; models: string[] }
  | { success: false; error: string };

type ProviderPayload = {
  id?: string;
  label?: string;
  apiKey?: string;
  baseUrl?: string | null;
  retainStoredApiKey?: boolean;
};

async function parseProviderPayload(request: Request): Promise<ProviderPayload | null> {
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as {
      provider?: ProviderPayload;
    };

    return payload.provider ?? null;
  }

  const formData = await request.formData();
  return {
    id: typeof formData.get("id") === "string" ? String(formData.get("id")) : undefined,
    label: typeof formData.get("label") === "string" ? String(formData.get("label")) : undefined,
    apiKey: typeof formData.get("apiKey") === "string" ? String(formData.get("apiKey")) : undefined,
    baseUrl: typeof formData.get("baseUrl") === "string" ? String(formData.get("baseUrl")) : undefined,
    retainStoredApiKey: formData.get("retainStoredApiKey") === "true",
  };
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { fetchProviderModels, getSystemConfig, normalizeProviderDrafts } = await import("~/lib/server/index.server");

  requireAdmin(session);

  let providerDraft: ProviderPayload | null;

  try {
    providerDraft = await parseProviderPayload(request);
  } catch {
    return Response.json({ success: false, error: "Invalid request body." } satisfies ActionResult, { status: 400 });
  }

  try {
    if (!providerDraft) {
      return Response.json({ success: false, error: "Provider payload is required." } satisfies ActionResult, { status: 400 });
    }

    const currentConfig = await getSystemConfig();
    const [provider] = normalizeProviderDrafts([providerDraft], currentConfig?.providers ?? []);

    if (!provider) {
      return Response.json({ success: false, error: "Provider details are incomplete." } satisfies ActionResult, { status: 400 });
    }

    if (!provider.apiKey) {
      return Response.json({ success: false, error: "API key is required before fetching models." } satisfies ActionResult, { status: 400 });
    }

    const models = await fetchProviderModels({
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    });

    return Response.json({ success: true, models } satisfies ActionResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models.";
    return Response.json({ success: false, error: message } satisfies ActionResult, { status: 500 });
  }
}

export default function AdminModelsRoute() {
  return null;
}
