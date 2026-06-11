/**
 * API client helpers for the ResearchGPT frontend.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface CreateResearchResponse {
  id: string;
  query: string;
  ticker: string;
  status: string;
  createdAt: string;
}

export interface ResearchRun {
  id: string;
  rawQuery: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: string;
  totalDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ResearchRunDetail extends ResearchRun {
  report: {
    id: string;
    ticker: string;
    companyName: string;
    confidenceOverall: number;
    confidenceBreakdown: Record<string, number>;
    recommendation: string | null;
    generatedAt: string;
    sections: Array<{
      sectionId: string;
      title: string;
      sectionOrder: number;
      content: string;
      generatedBy: string;
      hasDataGap: boolean;
    }>;
    citations: Array<{
      displayId: string;
      title: string;
      sourceName: string;
      url: string;
      citationType: string;
    }>;
  } | null;
}

/**
 * Initiate a new research run.
 */
export async function createResearch(query: string): Promise<CreateResearchResponse> {
  const response = await fetch(`${BACKEND_URL}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `Failed to create research run: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get a specific research run by ID.
 */
export async function getResearchRun(id: string): Promise<ResearchRunDetail> {
  const response = await fetch(`${BACKEND_URL}/api/research/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch research run: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get all research runs (history).
 */
export async function getResearchHistory(): Promise<{ runs: ResearchRun[]; total: number }> {
  const response = await fetch(`${BACKEND_URL}/api/research`);

  if (!response.ok) {
    throw new Error(`Failed to fetch research history: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Build the SSE stream URL for a research run.
 */
export function getStreamUrl(runId: string): string {
  return `${BACKEND_URL}/api/research/${runId}/stream`;
}
