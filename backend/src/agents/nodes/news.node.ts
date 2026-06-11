/**
 * News Agent Node — IndianAPI Edition
 *
 * Responsibilities:
 * 1. Fetch Indian stock news via IndianApiTool
 * 2. Search Tavily + Exa for supplementary/recent news
 * 3. Use Gemini to analyze sentiment and identify material events
 * 4. Write the Recent News Analysis section markdown
 * 5. Emit SSE section event
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ResearchState } from '../state/research-state';
import { IndianApiTool } from '../tools/indian-api.tool';
import { SearchTool, SearchResult } from '../tools/search.tool';
import { invokeWithRetry, sanitizeJsonString } from '../tools/llm-helper';
import {
  Evidence,
  NewsAgentOutput,
  AnalyzedArticle,
  MaterialEvent,
  OverallSentiment,
  TokenUsage,
} from '../types/agent-types';
import { v4 as uuidv4 } from 'uuid';

const NEWS_SYSTEM_PROMPT = `You are the News Analysis Agent for ResearchGPT. You analyze recent news about an Indian company for an equity research report.

Given a list of news articles, you will:
1. Analyze the overall news sentiment (very_negative, negative, neutral, positive, very_positive)
2. Identify material events (earnings, acquisitions, lawsuits, regulatory actions, executive changes, product launches, partnerships)
3. Write the Recent News Analysis section in professional markdown format

Return ONLY a valid JSON object with this structure:
{
  "overallSentiment": {
    "score": 0.3,
    "label": "positive",
    "distribution": { "positive": 60, "neutral": 30, "negative": 10 }
  },
  "articles": [
    {
      "title": "...",
      "source": "Reuters",
      "url": "https://...",
      "publishedAt": "2026-06-01",
      "summary": "Two sentence summary.",
      "sentiment": 0.5,
      "relevanceScore": 0.9,
      "categories": ["earnings", "guidance"]
    }
  ],
  "materialEvents": [
    {
      "type": "earnings",
      "headline": "Reliance beats Q1 expectations by 15%",
      "date": "2026-05-28",
      "impact": "positive",
      "significance": "high",
      "sourceUrl": "https://..."
    }
  ],
  "sectionMarkdown": "## Recent News Analysis\\n\\n..."
}

The sectionMarkdown should be 300-500 words covering sentiment overview, key themes, and material events. Make sure it uses Indian business context (INR, SEBI, NSE/BSE references where applicable).
Always back up claims, quotes, or events in the sectionMarkdown by linking directly to the exact source article URL using standard markdown format: [Source Name](URL). For example: [Economic Times](https://economictimes.indiatimes.com/...). Use the exact URLs provided for each article in the context.`;

export async function newsNode(
  state: ResearchState,
): Promise<Partial<ResearchState>> {
  const { runId, company, sseEmitter } = state;

  if (!company) {
    return { errors: ['News agent: company not resolved by planner'] };
  }

  sseEmitter?.next({
    event: 'progress',
    data: { agent: 'news', message: `Searching news for ${company.companyName}...` },
  });

  const indianApiKey = process.env.INDIAN_API_KEY!;
  const geminiApiKey = process.env.GCP_API_KEY!;

  const api = new IndianApiTool(indianApiKey);
  const searchTool = new SearchTool(
    process.env.TAVILY_API_KEY!,
    process.env.EXA_API_KEY,
  );
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: geminiApiKey,
    temperature: 0.2,
    json: true,
  });

  try {
    // 1. Fetch news from IndianAPI
    // Enforce clean ticker lookup, fallback to nseCode, bseCode, or companyName
    const lookupKey = (company.ticker && !company.ticker.includes(' ') && company.ticker.length <= 12)
      ? company.ticker
      : (company.nseCode || company.bseCode || company.companyName);

    const stockData = await api.getStock(lookupKey).catch(() => null);
    const rawRecentNews = stockData?.recentNews ?? [];
    const parsedRecentNews = Array.isArray(rawRecentNews)
      ? rawRecentNews.map((n: any) => IndianApiTool.parsePsObject(n))
      : [];

    const indianApiNews: SearchResult[] = parsedRecentNews.map((n: any) => ({
      title: n.headline || n.title || 'No Headline',
      content: n.summary || n.content || n.headline || '',
      url: n.url || `https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}`,
      publishedDate: n.date || '',
      source: n.source || 'IndianAPI News',
    }));

    // 2. Search for additional web news
    const webNews = await searchTool.searchNews(company.ticker, company.companyName).catch(() => []);

    // 3. Merge news (de-duplicate by URL)
    const mergedArticles: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const art of [...webNews, ...indianApiNews]) {
      const url = art.url?.toLowerCase().trim();
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        mergedArticles.push(art);
      }
    }

    if (mergedArticles.length === 0) {
      const fallbackMarkdown = `## Recent News Analysis\n\n> ⚠️ **Data Gap**: No significant news coverage found for ${company.companyName} in the past 30 days.\n\nThis may indicate low media coverage or a quiet period for the company. Investors should verify current developments independently.`;

      sseEmitter?.next({
        event: 'section',
        data: {
          sectionId: 'news_analysis',
          title: 'Recent News Analysis',
          content: fallbackMarkdown,
          order: 4,
          hasDataGap: true,
        },
      });

      return {
        newsOutput: {
          evidence: [],
          articles: [],
          overallSentiment: { score: 0, label: 'neutral', distribution: { positive: 0, neutral: 100, negative: 0 } },
          materialEvents: [],
          sectionMarkdown: fallbackMarkdown,
          tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' },
          hasDataGap: true,
        },
      };
    }

    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'news', message: `Analyzing ${mergedArticles.length} articles...` },
    });

    // Build article context for LLM (limit to first 10 to control tokens)
    const articleContext = mergedArticles
      .slice(0, 10)
      .map(
        (a, i) =>
          `Article ${i + 1}:\nTitle: ${a.title}\nSource: ${a.source || 'Unknown'}\nURL: ${a.url}\nDate: ${a.publishedDate || 'Unknown'}\nContent: ${a.content.slice(0, 500)}...`,
      )
      .join('\n\n---\n\n');

    const llmResponse = await invokeWithRetry(llm, [
      new SystemMessage(NEWS_SYSTEM_PROMPT),
      new HumanMessage(
        `Company: ${company.companyName} (${company.ticker}) — ${company.sector}\n\nArticles:\n${articleContext}`,
      ),
    ]);

    const responseText = String(llmResponse.content);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('News LLM did not return valid JSON');
    }

    const sanitizedJson = sanitizeJsonString(jsonMatch[0]);
    const parsed = JSON.parse(sanitizedJson) as {
      overallSentiment: OverallSentiment;
      articles: AnalyzedArticle[];
      materialEvents: MaterialEvent[];
      sectionMarkdown: string;
    };

    // Build evidence from articles
    const evidence: Evidence[] = mergedArticles.slice(0, 10).map((a) => ({
      id: uuidv4(),
      runId,
      sourceAgent: 'news' as const,
      evidenceType: 'news_article' as const,
      content: `${a.title}: ${a.content.slice(0, 300)}`,
      sourceUrl: a.url,
      sourceName: a.source || 'Unknown',
      confidence: 0.8,
      relevanceScore: a.score ?? 0.7,
      collectedAt: new Date().toISOString(),
      dataAsOf: a.publishedDate,
    }));

    const tokenUsage: TokenUsage = {
      inputTokens: (llmResponse.usage_metadata?.input_tokens as number) ?? 0,
      outputTokens: (llmResponse.usage_metadata?.output_tokens as number) ?? 0,
      model: 'gemini-2.5-flash',
    };

    const output: NewsAgentOutput = {
      evidence,
      articles: parsed.articles || [],
      overallSentiment: parsed.overallSentiment || {
        score: 0,
        label: 'neutral',
        distribution: { positive: 33, neutral: 34, negative: 33 },
      },
      materialEvents: parsed.materialEvents || [],
      sectionMarkdown: parsed.sectionMarkdown || '## Recent News Analysis\n\nAnalysis not available.',
      tokenUsage,
      hasDataGap: false,
    };

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'news_analysis',
        title: 'Recent News Analysis',
        content: output.sectionMarkdown,
        order: 4,
        hasDataGap: false,
      },
    });

    console.log(
      `[News] Completed for ${company.ticker} | Articles: ${mergedArticles.length} | Sentiment: ${output.overallSentiment.label}`,
    );

    return { newsOutput: output, evidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[News] Error:', message);

    const fallbackMarkdown = `## Recent News Analysis\n\n> ⚠️ **Data Gap**: Unable to retrieve news data for ${company.companyName}.\n\nError: ${message}`;

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'news_analysis',
        title: 'Recent News Analysis',
        content: fallbackMarkdown,
        order: 4,
        hasDataGap: true,
      },
    });

    return {
      errors: [`News agent error: ${message}`],
      newsOutput: {
        evidence: [],
        articles: [],
        overallSentiment: { score: 0, label: 'neutral', distribution: { positive: 0, neutral: 100, negative: 0 } },
        materialEvents: [],
        sectionMarkdown: fallbackMarkdown,
        tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' },
        hasDataGap: true,
      },
    };
  }
}
