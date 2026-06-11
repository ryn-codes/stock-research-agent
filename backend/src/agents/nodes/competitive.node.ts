/**
 * Competitive Agent Node — IndianAPI Edition
 *
 * Responsibilities:
 * 1. Fetch peer competitors from IndianAPI (via peerCompanyList or /industry_search)
 * 2. Search for competitive dynamics news
 * 3. Use Gemini to build comparison and assess competitive moat
 * 4. Write the Competitive Analysis section markdown
 * 5. Emit SSE section event
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ResearchState } from '../state/research-state';
import { IndianApiTool } from '../tools/indian-api.tool';
import { SearchTool } from '../tools/search.tool';
import { ScreenerTool } from '../tools/screener.tool';
import { invokeWithRetry, sanitizeJsonString } from '../tools/llm-helper';
import { formatCurrency, formatPercent } from '../tools/financial-calculator.tool';
import {
  Evidence,
  CompetitiveAgentOutput,
  CompetitorProfile,
  ComparisonMetric,
  MoatAssessment,
  TokenUsage,
} from '../types/agent-types';
import { v4 as uuidv4 } from 'uuid';

const COMPETITIVE_SYSTEM_PROMPT = `You are the Competitive Analysis Agent for ResearchGPT. You write the Competitive Analysis section of an equity research report.

Given an Indian company's financial data and competitor data, analyze:
1. The competitive landscape in India — key players, relative positioning, and market share.
2. Key differentiators and competitive advantages (technology, distribution networks, scale, brand).
3. Moat assessment (wide/narrow/none) with Indian/global sources (switching costs, cost advantage, intangible assets, network effects, efficient scale).
4. Competitor comparison based on market cap, P/E, and other metrics.

Return ONLY a valid JSON object:
{
  "competitiveNarrative": "...",
  "moatAssessment": {
    "type": "wide",
    "sources": ["network_effects", "switching_costs"],
    "durability": "high",
    "rationale": "..."
  },
  "sectionMarkdown": "## Competitive Analysis\\n\\n..."
}

The sectionMarkdown should be 350-500 words with a comparison table and narrative. Use ₹ (INR) and Indian numbering system units (Crores/Lakhs) where appropriate.
Always back up claims, competitor metrics, or market share assertions in the sectionMarkdown by linking directly to the exact source URL using standard markdown format: [Source Name](URL). Use the exact URLs provided in the context.`;

export async function competitiveNode(
  state: ResearchState,
): Promise<Partial<ResearchState>> {
  const { runId, company, financialOutput, sseEmitter } = state;

  if (!company) {
    return { errors: ['Competitive agent: company not resolved by planner'] };
  }

  sseEmitter?.next({
    event: 'progress',
    data: { agent: 'competitive', message: `Identifying competitors for ${company.companyName}...` },
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
    temperature: 0.3,
    json: true,
  });

  try {
    // 1. Fetch stock data for main company to get peer list
    // Enforce clean ticker lookup, fallback to nseCode, bseCode, or companyName
    const lookupKey = (company.ticker && !company.ticker.includes(' ') && company.ticker.length <= 12)
      ? company.ticker
      : (company.nseCode || company.bseCode || company.companyName);

    // Fetch Screener.in grounding data
    const screenerData = await ScreenerTool.getCompanyData(lookupKey).catch(() => null);

    const stockData = await api.getStock(lookupKey).catch(() => null);
    const rawPeers = stockData?.companyProfile?.peerCompanyList ?? [];
    
    let parsedPeers: any[] = [];
    if (Array.isArray(rawPeers)) {
      parsedPeers = rawPeers;
    } else if (typeof rawPeers === 'string') {
      const parsed = IndianApiTool.parsePsObject(rawPeers);
      parsedPeers = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    }

    // 2. Fallback: Industry search if no peers found
    if (parsedPeers.length === 0 && company.industry) {
      console.log(`[Competitive] No peerCompanyList found, attempting industry search for: ${company.industry}`);
      const industryPeers = await api.getIndustryPeers(company.industry).catch(() => []);
      parsedPeers = industryPeers.slice(0, 5);
    }

    // Filter peers to avoid infinite loops and limit to 5
    const peers = parsedPeers
      .map((p) => IndianApiTool.parsePsObject(p))
      .filter((p) => p && p.companyName && p.companyName !== company.companyName)
      .slice(0, 5);

    sseEmitter?.next({
      event: 'progress',
      data: {
        agent: 'competitive',
        message: `Fetched details for competitors...`,
      },
    });

    let competitors: CompetitorProfile[] = [];
    const peCompetitors: Record<string, number | string> = {};

    if (peers.length > 0) {
      competitors = peers.map((p) => {
        const mcapStr = String(p.marketCap || '0');
        const mcapVal = parseFloat(mcapStr.replace(/[₹,\s]/g, '')) || 0;
        return {
          ticker: p.tickerId || p.ticker || p.companyName,
          companyName: p.companyName,
          marketCap: mcapVal, // Already in Cr
          description: p.overallRating ? `Market Rating: ${p.overallRating}. Net Change: ${p.percentChange}%` : '',
          overlapAreas: [company.industry || ''],
        };
      });

      peers.forEach((p) => {
        const peStr = String(p.priceToEarningsValueRatio ?? p.pe ?? '');
        const peVal = parseFloat(peStr.replace(/[,\s]/g, ''));
        if (p.companyName) {
          peCompetitors[p.companyName] = isNaN(peVal) ? 'N/A' : peVal;
        }
      });
    }

    // Fallback or augment with Screener.in peer metrics
    if (screenerData && screenerData.peersHtml) {
      const screenerPeers = ScreenerTool.parsePeers(screenerData.peersHtml);
      const filteredScreenerPeers = screenerPeers.filter(
        (p) => p.name.toLowerCase() !== company.companyName.toLowerCase() && p.ticker.toLowerCase() !== lookupKey.toLowerCase()
      ).slice(0, 5);

      if (competitors.length === 0) {
        console.log(`[Competitive] Falling back to Screener.in peers (${filteredScreenerPeers.length} found)`);
        competitors = filteredScreenerPeers.map((p) => ({
          ticker: p.ticker,
          companyName: p.name,
          marketCap: p.marketCap,
          description: `Screener.in Peer`,
          overlapAreas: [company.industry || ''],
        }));
        filteredScreenerPeers.forEach((p) => {
          peCompetitors[p.name] = p.pe ?? 'N/A';
        });
      } else {
        // Augment missing PE/Market Cap in IndianAPI peers using Screener data
        competitors.forEach((c) => {
          const match = filteredScreenerPeers.find(
            (sp) => sp.name.toLowerCase() === c.companyName.toLowerCase() || sp.ticker.toLowerCase() === c.ticker.toLowerCase()
          );
          if (match) {
            if (!c.marketCap && match.marketCap) {
              c.marketCap = match.marketCap;
            }
            if (peCompetitors[c.companyName] === 'N/A' || peCompetitors[c.companyName] === undefined) {
              if (match.pe !== null) {
                peCompetitors[c.companyName] = match.pe;
              }
            }
          }
        });
      }
    }

    // 3. Search for competitive news / dynamics
    const competitiveArticles = await searchTool.searchCompetitive(
      company.ticker,
      company.companyName,
      company.sector,
    ).catch(() => []);

    // 4. Build Comparison Metrics Table
    const comparisonTable: ComparisonMetric[] = [];

    // Market Cap Metric
    const mcapCompetitors: Record<string, number | string> = {};
    competitors.forEach((c) => {
      mcapCompetitors[c.companyName] = c.marketCap;
    });
    const allMcaps = [
      { name: company.companyName, val: company.marketCap ?? 0 },
      ...competitors.map((c) => ({ name: c.companyName, val: c.marketCap })),
    ].sort((a, b) => b.val - a.val);
    const mcapRank = allMcaps.findIndex((x) => x.name === company.companyName) + 1;

    comparisonTable.push({
      metric: 'Market Cap',
      subjectValue: company.marketCap ?? 'N/A',
      competitors: mcapCompetitors,
      unit: '₹ Cr',
      subjectRank: mcapRank > 0 ? mcapRank : 1,
    });

    // P/E Metric
    const peCompetitorsFiltered: Record<string, number | string> = {};
    competitors.forEach((c) => {
      peCompetitorsFiltered[c.companyName] = peCompetitors[c.companyName] ?? 'N/A';
    });
    comparisonTable.push({
      metric: 'P/E Ratio',
      subjectValue: financialOutput?.financialSummary?.peRatio ?? 'N/A',
      competitors: peCompetitorsFiltered,
      unit: 'x',
      subjectRank: 1, // Default rank
    });

    // 5. Construct context for LLM
    const subjectFinancials = financialOutput
      ? `- Market Cap: ${formatCurrency(financialOutput.financialSummary.marketCap, true)}
- P/E: ${financialOutput.financialSummary.peRatio?.toFixed(1) ?? 'N/A'}
- Gross Margin: ${formatPercent(financialOutput.derivedMetrics.grossMargin)}
- Operating Margin: ${formatPercent(financialOutput.derivedMetrics.operatingMargin)}
- Revenue Growth YoY: ${formatPercent(financialOutput.derivedMetrics.revenueGrowthYoY)}`
      : `Market Cap: ${formatCurrency(company.marketCap, true)}`;

    const peerSummary = competitors
      .map((c) => {
        const peVal = peCompetitorsFiltered[c.companyName];
        return `- ${c.companyName} (${c.ticker}): Market Cap ${formatCurrency(c.marketCap, true)} | P/E: ${peVal}`;
      })
      .join('\n');

    const screenerContext = screenerData && screenerData.peersHtml ? `
SCREENER.IN PEER COMPARISON TABLE (HTML):
${screenerData.peersHtml}
` : '';

    const competitiveNewsContext = competitiveArticles
      .slice(0, 4)
      .map((a) => `- ${a.title}: ${a.content.slice(0, 200)}`)
      .join('\n');

    const llmResponse = await invokeWithRetry(llm, [
      new SystemMessage(COMPETITIVE_SYSTEM_PROMPT),
      new HumanMessage(
        `Company: ${company.companyName} (${company.ticker})
Sector: ${company.sector} / ${company.industry}

SOURCE URLS FOR INLINE CITATIONS:
- Screener.in Peer Comparison URL: ${screenerData ? screenerData.url : 'None'}
- IndianAPI Stock URL: https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}
- Competitor News URLs:
${competitiveArticles.slice(0, 4).map(a => `- ${a.source || 'Web'}: ${a.url}`).join('\n')}

SUBJECT COMPANY FINANCIALS:
${subjectFinancials}

IDENTIFIED PEER COMPETITORS (${competitors.length}):
${peerSummary || 'No peer data available — infer from sector knowledge'}
${screenerContext}

COMPETITIVE NEWS & DYNAMICS:
${competitiveNewsContext || 'No competitive news found'}

Write the competitive analysis section.`,
      ),
    ]);

    const responseText = String(llmResponse.content);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Competitive LLM did not return valid JSON');
    }

    const sanitizedJson = sanitizeJsonString(jsonMatch[0]);
    const parsed = JSON.parse(sanitizedJson) as {
      competitiveNarrative: string;
      moatAssessment: MoatAssessment;
      sectionMarkdown: string;
    };

    // Build evidence objects
    const evidence: Evidence[] = [];

    if (screenerData) {
      evidence.push({
        id: uuidv4(),
        runId,
        sourceAgent: 'competitive',
        evidenceType: 'competitive_position',
        content: `Screener.in peer comparison data for ${company.companyName}. Peer table details fetched directly from Screener.`,
        structuredData: { url: screenerData.url } as any,
        sourceUrl: screenerData.url,
        sourceName: 'Screener.in Peer Comparison',
        confidence: 0.95,
        relevanceScore: 1.0,
        collectedAt: new Date().toISOString(),
      });
    }

    if (competitors.length > 0) {
      evidence.push({
        id: uuidv4(),
        runId,
        sourceAgent: 'competitive',
        evidenceType: 'competitive_position',
        content: `${company.companyName} competes against: ${competitors.map((c) => `${c.companyName} (${c.ticker}, Market Cap ${formatCurrency(c.marketCap, true)})`).join(', ')}`,
        sourceUrl: `https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}`,
        sourceName: 'IndianAPI Peer List',
        confidence: 0.9,
        relevanceScore: 1.0,
        collectedAt: new Date().toISOString(),
      });
    }

    competitiveArticles.slice(0, 3).forEach((a) => {
      evidence.push({
        id: uuidv4(),
        runId,
        sourceAgent: 'competitive',
        evidenceType: 'competitor_metric',
        content: `${a.title}: ${a.content.slice(0, 200)}`,
        sourceUrl: a.url,
        sourceName: a.source || 'Web Search',
        confidence: 0.75,
        relevanceScore: a.score ?? 0.7,
        collectedAt: new Date().toISOString(),
      });
    });


    const tokenUsage: TokenUsage = {
      inputTokens: (llmResponse.usage_metadata?.input_tokens as number) ?? 0,
      outputTokens: (llmResponse.usage_metadata?.output_tokens as number) ?? 0,
      model: 'gemini-2.5-flash',
    };

    const output: CompetitiveAgentOutput = {
      evidence,
      competitors,
      comparisonTable,
      competitiveNarrative: parsed.competitiveNarrative || '',
      moatAssessment: parsed.moatAssessment || {
        type: 'narrow',
        sources: [],
        durability: 'medium',
        rationale: 'Insufficient data for moat assessment.',
      },
      sectionMarkdown: parsed.sectionMarkdown || '## Competitive Analysis\n\nAnalysis not available.',
      tokenUsage,
      hasDataGap: competitors.length === 0,
    };

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'competitive_analysis',
        title: 'Competitive Analysis',
        content: output.sectionMarkdown,
        order: 5,
        hasDataGap: output.hasDataGap,
      },
    });

    console.log(
      `[Competitive] Completed for ${company.ticker} | Peers: ${competitors.length} | Moat: ${output.moatAssessment.type}`,
    );

    return { competitiveOutput: output, evidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Competitive] Error:', message);

    const fallbackMarkdown = `## Competitive Analysis\n\n> ⚠️ **Data Gap**: Unable to complete competitive analysis for ${company.companyName}.\n\nError: ${message}`;

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'competitive_analysis',
        title: 'Competitive Analysis',
        content: fallbackMarkdown,
        order: 5,
        hasDataGap: true,
      },
    });

    return {
      errors: [`Competitive agent error: ${message}`],
      competitiveOutput: {
        evidence: [],
        competitors: [],
        comparisonTable: [],
        competitiveNarrative: '',
        moatAssessment: { type: 'none', sources: [], durability: 'low', rationale: 'Data unavailable' },
        sectionMarkdown: fallbackMarkdown,
        tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' },
        hasDataGap: true,
      },
    };
  }
}
