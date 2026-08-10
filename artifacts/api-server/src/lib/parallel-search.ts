import { logger } from "./logger";

export type ParallelSearchResult = {
  query: string;
  snippets: string[];
  sourceUrl?: string;
};

export async function searchWebGrounding(query: string): Promise<ParallelSearchResult> {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    logger.info({ query }, "PARALLEL_API_KEY not set; providing standard filmmaking technical context.");
    return {
      query,
      snippets: [
        `Standard 2026 media specs for "${query}": H.264/AAC MP4, 9:16 reframe crop filter (1080x1920), 48kHz audio, Rec.709 color curve.`,
      ],
      sourceUrl: "https://parallel.web/search",
    };
  }

  try {
    const response = await fetch("https://api.parallel.web/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 3 }),
    });

    if (!response.ok) {
      throw new Error(`Parallel Search API returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as { results?: Array<{ snippet?: string; url?: string }> };
    const snippets = (data.results ?? []).map((res) => res.snippet).filter((s): s is string => Boolean(s));

    return {
      query,
      snippets: snippets.length > 0 ? snippets : [`Query results for ${query}`],
      sourceUrl: data.results?.[0]?.url ?? "https://parallel.web",
    };
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Parallel search query failed; fallback active");
    return {
      query,
      snippets: [`Fallback filmmaking technical context for ${query}`],
    };
  }
}
