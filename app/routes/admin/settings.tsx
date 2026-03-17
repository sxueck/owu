import type { Route } from "./+types/settings";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { getSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "System Settings - OWU Admin" },
    { name: "description", content: "Configure system settings" },
  ];
}

interface LoaderData {
  config: {
    id: string;
    hasApiKey: boolean;
    openaiBaseUrl: string | null;
    allowedModels: string[];
    updatedAt: Date;
    updatedBy: string | null;
  } | null;
  isConfigured: boolean;
}

function formatModelsForDisplay(models: string[]): string {
  return models.join("\n");
}

/**
 * Loader: Get current configuration (public-safe, no API keys)
 */
export async function loader({ request }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { getPublicConfig, isOpenAIConfigured } = await import("~/lib/server/index.server");
  requireAdmin(session);

  const [config, configured] = await Promise.all([
    getPublicConfig(),
    isOpenAIConfigured(),
  ]);

  return { config, isConfigured: configured };
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string>;
  values?: {
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    allowedModels?: string;
  };
}

/**
 * Action: Save system configuration
 */
export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireAdmin } = await import("~/lib/server/session.server");
  const { saveSystemConfig, parseModelsInput } = await import("~/lib/server/index.server");
  const admin = requireAdmin(session);

  const formData = await request.formData();

  const openaiApiKey = formData.get("openaiApiKey") as string;
  const openaiBaseUrl = formData.get("openaiBaseUrl") as string;
  const allowedModelsInput = formData.get("allowedModels") as string;

  // Validation
  const errors: Record<string, string> = {};

  // API Key must be explicitly provided and non-empty
  const trimmedApiKey = openaiApiKey?.trim();
  if (!trimmedApiKey) {
    errors.openaiApiKey = "API Key is required and must be non-empty";
  }

  // Parse and validate models
  const allowedModels = parseModelsInput(allowedModelsInput);
  if (allowedModels.length === 0) {
    errors.allowedModels = "At least one model is required";
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values: {
        openaiApiKey: openaiApiKey || "",
        openaiBaseUrl: openaiBaseUrl || "",
        allowedModels: allowedModelsInput || "",
      },
    };
  }

  try {
    // Save configuration - API Key must be explicitly provided (enforced by validation above)
    await saveSystemConfig({
      openaiApiKey: trimmedApiKey!,
      openaiBaseUrl: openaiBaseUrl?.trim() || null,
      allowedModels,
      updatedBy: admin.userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to save configuration:", error);
    return {
      errors: { general: "Failed to save configuration. Please try again." },
      values: {
        openaiApiKey: openaiApiKey || "",
        openaiBaseUrl: openaiBaseUrl || "",
        allowedModels: allowedModelsInput || "",
      },
    };
  }
}

export default function AdminSettingsPage() {
  const { config, isConfigured } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Default form values
  const defaultValues = {
    openaiApiKey: actionData?.values?.openaiApiKey ?? "",
    openaiBaseUrl: actionData?.values?.openaiBaseUrl ?? config?.openaiBaseUrl ?? "",
    allowedModels: actionData?.values?.allowedModels ?? formatModelsForDisplay(config?.allowedModels ?? []),
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">System Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure your OpenAI API credentials and model settings
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config?.hasApiKey ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <svg className={`w-5 h-5 ${config?.hasApiKey ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">API Key</p>
              <p className={`text-xs ${config?.hasApiKey ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {config?.hasApiKey ? 'Configured' : 'Not configured'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${(config?.allowedModels.length ?? 0) > 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <svg className={`w-5 h-5 ${(config?.allowedModels.length ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Models</p>
              <p className={`text-xs ${(config?.allowedModels.length ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {config?.allowedModels.length ?? 0} configured
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConfigured ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
              <svg className={`w-5 h-5 ${isConfigured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">System Status</p>
              <p className={`text-xs ${isConfigured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isConfigured ? 'Ready' : 'Incomplete'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">OpenAI Configuration</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            Your API key is stored securely and never exposed to clients.
          </p>
        </div>

        {/* Success Message */}
        {actionData?.success && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Configuration saved successfully
              </p>
            </div>
          </div>
        )}

        {/* General Error */}
        {actionData?.errors?.general && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400">
                {actionData.errors.general}
              </p>
            </div>
          </div>
        )}

        <Form method="post" className="space-y-6">
          {/* API Key Field */}
          <div>
            <label htmlFor="openaiApiKey" className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
              API Key <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                id="openaiApiKey"
                name="openaiApiKey"
                defaultValue={defaultValues.openaiApiKey}
                placeholder="sk-..."
                className={`w-full px-4 py-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all ${
                  actionData?.errors?.openaiApiKey
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="off"
              />
              {config?.hasApiKey && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">
                    Configured
                  </span>
                </div>
              )}
            </div>
            {actionData?.errors?.openaiApiKey && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {actionData.errors.openaiApiKey}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Enter your OpenAI API key. Must be non-empty to save.
            </p>
          </div>

          {/* Base URL Field */}
          <div>
            <label htmlFor="openaiBaseUrl" className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
              Base URL <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              id="openaiBaseUrl"
              name="openaiBaseUrl"
              defaultValue={defaultValues.openaiBaseUrl}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all hover:border-gray-400 dark:hover:border-gray-600"
            />
            <p className="mt-2 text-xs text-gray-500">
              Leave empty to use the official OpenAI API endpoint.
            </p>
          </div>

          {/* Allowed Models Field */}
          <div>
            <label htmlFor="allowedModels" className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
              Allowed Models <span className="text-red-500">*</span>
            </label>
            <textarea
              id="allowedModels"
              name="allowedModels"
              rows={6}
              defaultValue={defaultValues.allowedModels}
              placeholder="gpt-4o-mini&#10;gpt-4o&#10;gpt-4-turbo"
              className={`w-full px-4 py-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white font-mono text-sm transition-all ${
                actionData?.errors?.allowedModels
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            />
            {actionData?.errors?.allowedModels && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {actionData.errors.allowedModels}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              One model per line. Only these models will be available to users.
            </p>
          </div>

          {/* Model Suggestions */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Common models</p>
            <div className="flex flex-wrap gap-2">
              {['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'].map((model) => (
                <code key={model} className="text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                  {model}
                </code>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 flex items-center gap-4 border-t border-gray-200 dark:border-gray-800">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Settings
                </>
              )}
            </button>
            {config?.updatedAt && (
              <span className="text-sm text-gray-500">
                Last updated: {new Date(config.updatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </Form>
      </div>
    </div>
  );
}
