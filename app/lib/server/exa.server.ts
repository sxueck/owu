import type { SearchConfig } from "./config.server";

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
  query: string;
}

const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";

/**
 * Check if Exa search is configured and available
 */
export function isExaConfigured(config: SearchConfig): boolean {
  return config.enabled && config.isConfigured && config.apiKey !== null && config.apiKey.length > 0;
}

/**
 * Execute a search query using Exa API
 */
export async function executeExaSearch(
  query: string,
  config: SearchConfig
): Promise<ExaSearchResponse> {
  if (!isExaConfigured(config)) {
    throw new Error("Exa search is not configured");
  }

  const baseUrl = config.baseUrl || DEFAULT_EXA_BASE_URL;
  const apiKey = config.apiKey!;
  const numResults = config.defaultResultCount || 5;

  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        numResults,
        includeDomains: [],
        excludeDomains: [],
        startPublishedDate: null,
        endPublishedDate: null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      results?: Array<{
        title?: string;
        url?: string;
        snippet?: string;
        publishedDate?: string;
      }>;
    };

    const results: ExaSearchResult[] = (data.results || [])
      .map((result) => ({
        title: result.title || "Untitled",
        url: result.url || "",
        snippet: result.snippet || "",
        publishedDate: result.publishedDate,
      }))
      .filter((result) => result.url.length > 0);

    return {
      results,
      query,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Exa search failed: ${error.message}`);
    }
    throw new Error("Exa search failed: Unknown error");
  }
}

/**
 * Format Exa search results for inclusion in chat messages
 */
export function formatExaResultsForToolResponse(response: ExaSearchResponse): string {
  if (response.results.length === 0) {
    return `No results found for "${response.query}".`;
  }

  const lines = response.results.map((result, index) => {
    const parts = [
      `${index + 1}. ${result.title}`,
      `   URL: ${result.url}`,
    ];
    if (result.snippet) {
      parts.push(`   Summary: ${result.snippet}`);
    }
    return parts.join("\n");
  });

  return lines.join("\n\n");
}
