/**
 * Search Tools — Tavily + Exa
 * Wraps both search APIs for news and competitive research.
 * Exa is used as a fallback if Tavily fails.
 */

import { TavilySearch } from '@langchain/tavily';
import Exa from 'exa-js';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
  source?: string;
}

export class SearchTool {
  private readonly tavily: TavilySearch;
  private readonly exa: Exa | null;

  constructor(tavilyApiKey: string, exaApiKey?: string) {
    this.tavily = new TavilySearch({
      maxResults: 10,
      tavilyApiKey: tavilyApiKey,
    });

    this.exa = exaApiKey ? new Exa(exaApiKey) : null;
  }

  /**
   * Search for recent news about a company using Tavily (primary) + Exa (fallback).
   * Returns up to 10 results from the last 30 days.
   */
  async searchNews(
    ticker: string,
    companyName: string,
  ): Promise<SearchResult[]> {
    const query = `"${companyName}" OR "${ticker}" stock news analysis 2025 2026`;

    try {
      const rawResults = await this.tavily.invoke({ query });
      const parsed = this.parseTavilyResults(rawResults);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('[SearchTool] Tavily news search failed, trying Exa:', err);
    }

    // Exa fallback
    if (this.exa) {
      return this.searchExaNews(query);
    }

    return [];
  }

  /**
   * Search for competitive dynamics and market positioning.
   */
  async searchCompetitive(
    ticker: string,
    companyName: string,
    sector: string,
  ): Promise<SearchResult[]> {
    const query = `${companyName} competitors market share ${sector} industry analysis 2025 2026`;

    try {
      const rawResults = await this.tavily.invoke({ query });
      const parsed = this.parseTavilyResults(rawResults);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('[SearchTool] Tavily competitive search failed, trying Exa:', err);
    }

    if (this.exa) {
      return this.searchExaNews(query);
    }

    return [];
  }

  /**
   * Targeted search for a specific company topic.
   */
  async searchTopic(query: string): Promise<SearchResult[]> {
    try {
      const rawResults = await this.tavily.invoke({ query });
      return this.parseTavilyResults(rawResults);
    } catch {
      if (this.exa) {
        return this.searchExaNews(query);
      }
      return [];
    }
  }

  private parseTavilyResults(rawResults: unknown): SearchResult[] {
    if (!rawResults) return [];

    let parsedObj: any = rawResults;

    if (typeof rawResults === 'string') {
      try {
        parsedObj = JSON.parse(rawResults);
      } catch {
        // Return empty or fallback to string matching
        return [];
      }
    }

    // TavilySearch can return:
    // 1. An array of search results
    // 2. An object with a results array: { results: [...] }
    let resultsArray: any[] = [];
    if (Array.isArray(parsedObj)) {
      resultsArray = parsedObj;
    } else if (parsedObj && typeof parsedObj === 'object') {
      if (Array.isArray(parsedObj.results)) {
        resultsArray = parsedObj.results;
      } else if (parsedObj.content || parsedObj.url) {
        resultsArray = [parsedObj];
      }
    }

    return resultsArray.map((r: any) => ({
      title: String(r.title ?? r.name ?? ''),
      url: String(r.url ?? ''),
      content: String(r.content ?? r.snippet ?? r.raw_content ?? ''),
      score: typeof r.score === 'number' ? r.score : undefined,
      publishedDate: typeof r.published_date === 'string' ? r.published_date : (typeof r.publishedDate === 'string' ? r.publishedDate : undefined),
      source: typeof r.url === 'string' && r.url ? new URL(r.url).hostname : '',
    }));
  }

  private async searchExaNews(query: string): Promise<SearchResult[]> {
    if (!this.exa) return [];

    try {
      const response = await this.exa.searchAndContents(query, {
        numResults: 8,
        type: 'neural',
        useAutoprompt: true,
        contents: {
          text: { maxCharacters: 1000 },
        },
      });

      return (response.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: (r as Record<string, unknown> & { text?: string }).text ?? '',
        publishedDate: r.publishedDate ?? undefined,
        source: r.url ? new URL(r.url).hostname : '',
      }));
    } catch (err) {
      console.error('[SearchTool] Exa search also failed:', err);
      return [];
    }
  }
}
