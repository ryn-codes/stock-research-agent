/**
 * Thesis Agent Node — IndianAPI Edition
 *
 * Responsibilities:
 * 1. Synthesize all evidence from Financial, News, and Competitive agents
 * 2. Generate Bull Case, Bear Case, and Investment Thesis using Gemini
 * 3. Emit SSE section events for each sub-section
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ResearchState } from '../state/research-state';
import { formatCurrency, formatPercent } from '../tools/financial-calculator.tool';
import { invokeWithRetry, sanitizeJsonString } from '../tools/llm-helper';
import {
  ThesisAgentOutput,
  ThesisPoint,
  RecommendationType,
  TimeHorizon,
  TokenUsage,
} from '../types/agent-types';

const THESIS_SYSTEM_PROMPT = `You are the Thesis Agent for ResearchGPT. You synthesize all research evidence into a comprehensive investment thesis for an Indian company.

Given financial data, news analysis, and competitive intelligence, you will generate:
1. A Bull Case with 3-5 supporting arguments backed by evidence
2. A Bear Case with 3-5 key risks and concerns (e.g., regulatory, valuation, competition)
3. An overall Investment Thesis with a recommendation

Return ONLY a valid JSON object:
{
  "bullCase": {
    "title": "Digital Transformation Leadership",
    "keyPoints": [
      {
        "argument": "Revenue accelerating driven by cloud and AI migration",
        "supportingEvidence": ["financial_metric", "news_article"],
        "confidence": 0.9
      }
    ],
    "catalysts": ["New domestic contract wins", "Margin expansion"],
    "targetScenario": "If domestic growth accelerates, EPS could grow by 20% CAGR over next 3 years"
  },
  "bearCase": {
    "title": "Valuation and Regulatory Headwinds",
    "keyPoints": [
      {
        "argument": "Premium valuation compared to historic averages leaves no room for operational misses",
        "supportingEvidence": ["financial_metric"],
        "confidence": 0.8
      }
    ],
    "risks": ["SEBI regulations or sector policy changes", "Global slowdown impacting exports"],
    "targetScenario": "If margins compress, multiple de-rating could lead to a 15-20% price correction"
  },
  "investmentThesis": {
    "recommendation": "buy",
    "summary": "3-5 sentences synthesizing the overall thesis in Indian stock market context",
    "timeHorizon": "1_year",
    "keyAssumptions": ["Stable interest rates", "Infrastructure spending momentum"],
    "whatToWatch": ["NSE/BSE trading volumes", "Operating margins", "Corporate governance reports"]
  },
  "evidenceGaps": ["Lack of granular segment-wise quarterly data"],
  "bullSectionMarkdown": "## Bull Case\\n\\n...",
  "bearSectionMarkdown": "## Bear Case\\n\\n...",
  "thesisSectionMarkdown": "## Investment Thesis\\n\\n..."
}

Recommendation must be one of: strong_buy, buy, hold, sell, strong_sell
Time horizon must be one of: 3_months, 6_months, 1_year, 2_years
Use ₹ (INR) and Indian numbering system units (Crores/Lakhs) where appropriate.
Always back up claims, bull/bear points, or summary facts in the bullSectionMarkdown, bearSectionMarkdown, and thesisSectionMarkdown by linking directly to the source URL using standard markdown format: [Source Name](URL). Use the exact URLs provided in the source URLs list context.`;

export async function thesisNode(
  state: ResearchState,
): Promise<Partial<ResearchState>> {
  const { company, financialOutput, newsOutput, competitiveOutput, evidence, sseEmitter } = state;

  if (!company) {
    return { errors: ['Thesis agent: company not resolved'] };
  }

  sseEmitter?.next({
    event: 'phase',
    data: { phase: 'synthesizing', status: 'started', message: 'Synthesizing investment thesis...' },
  });

  const geminiApiKey = process.env.GCP_API_KEY!;
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: geminiApiKey,
    temperature: 0.4,
    json: true,
  });

  try {
    // Build comprehensive evidence summary for the LLM
    const financialContext = financialOutput
      ? `FINANCIAL DATA:
- Current Price: ₹${financialOutput.financialSummary.currentPrice} | Market Cap: ${formatCurrency(financialOutput.financialSummary.marketCap, true)} | P/E: ${financialOutput.financialSummary.peRatio?.toFixed(1) ?? 'N/A'}
- 52W Range: ₹${financialOutput.financialSummary.week52Low} – ₹${financialOutput.financialSummary.week52High}
- Revenue Growth YoY: ${formatPercent(financialOutput.derivedMetrics.revenueGrowthYoY)}
- Gross Margin: ${formatPercent(financialOutput.derivedMetrics.grossMargin)}
- Operating Margin: ${formatPercent(financialOutput.derivedMetrics.operatingMargin)}
- Net Margin: ${formatPercent(financialOutput.derivedMetrics.netMargin)}
- FCF Yield: ${formatPercent(financialOutput.derivedMetrics.freeCashFlowYield)}
- Debt/Equity: ${financialOutput.derivedMetrics.debtToEquity?.toFixed(2) ?? 'N/A'}x
- Return on Equity: ${formatPercent(financialOutput.derivedMetrics.returnOnEquity)}
${financialOutput.hasDataGap ? '⚠️ Some financial data was unavailable' : ''}`
      : 'Financial data not available';

    const newsContext = newsOutput
      ? `NEWS SENTIMENT: ${newsOutput.overallSentiment.label} (score: ${newsOutput.overallSentiment.score.toFixed(2)})
Distribution: ${newsOutput.overallSentiment.distribution.positive}% positive, ${newsOutput.overallSentiment.distribution.neutral}% neutral, ${newsOutput.overallSentiment.distribution.negative}% negative

MATERIAL EVENTS:
${newsOutput.materialEvents.slice(0, 5).map((e) => `- [${e.significance.toUpperCase()}/${e.impact}] ${e.headline} (${e.date})`).join('\n') || 'None identified'}

KEY NEWS THEMES:
${newsOutput.articles.slice(0, 5).map((a) => `- ${a.title} (sentiment: ${a.sentiment.toFixed(2)})`).join('\n') || 'No articles'}`
      : 'News data not available';

    const competitiveContext = competitiveOutput
      ? `COMPETITIVE POSITION:
- Moat: ${competitiveOutput.moatAssessment.type} | Sources: ${competitiveOutput.moatAssessment.sources.join(', ') || 'none'} | Durability: ${competitiveOutput.moatAssessment.durability}
- Moat Rationale: ${competitiveOutput.moatAssessment.rationale}
- Key Competitors: ${competitiveOutput.competitors.slice(0, 4).map((c) => `${c.companyName} (${formatCurrency(c.marketCap, true)})`).join(', ')}
${competitiveOutput.hasDataGap ? '⚠️ Limited competitive data available' : ''}`
      : 'Competitive data not available';

    const evidenceCount = evidence.length;
    const primarySourcesContext = evidence
      .filter((e) => e.sourceUrl)
      .map((e) => `- ${e.sourceName || e.evidenceType}: ${e.sourceUrl}`)
      .join('\n');

    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'thesis', message: `Synthesizing ${evidenceCount} evidence points...` },
    });

    const llmResponse = await invokeWithRetry(llm, [
      new SystemMessage(THESIS_SYSTEM_PROMPT),
      new HumanMessage(
        `Company: ${company.companyName} (${company.ticker})
Sector: ${company.sector} / ${company.industry}
Evidence Points: ${evidenceCount}

SOURCE URLS FOR INLINE CITATIONS:
${primarySourcesContext || 'None'}

${financialContext}

${newsContext}

${competitiveContext}

Generate the investment thesis for ${company.companyName}.`,
      ),
    ]);

    const responseText = String(llmResponse.content);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Thesis LLM did not return valid JSON');
    }

    const sanitizedJson = sanitizeJsonString(jsonMatch[0]);
    const parsed = JSON.parse(sanitizedJson) as {
      bullCase: {
        title: string;
        keyPoints: ThesisPoint[];
        catalysts: string[];
        targetScenario: string;
      };
      bearCase: {
        title: string;
        keyPoints: ThesisPoint[];
        risks: string[];
        targetScenario: string;
      };
      investmentThesis: {
        recommendation: RecommendationType;
        summary: string;
        timeHorizon: TimeHorizon;
        keyAssumptions: string[];
        whatToWatch: string[];
      };
      evidenceGaps: string[];
      bullSectionMarkdown: string;
      bearSectionMarkdown: string;
      thesisSectionMarkdown: string;
    };

    const combinedSectionMarkdown = [
      parsed.bullSectionMarkdown || `## Bull Case\n\n${parsed.bullCase?.title ?? ''}`,
      parsed.bearSectionMarkdown || `## Bear Case\n\n${parsed.bearCase?.title ?? ''}`,
      parsed.thesisSectionMarkdown || `## Investment Thesis\n\n${parsed.investmentThesis?.summary ?? ''}`,
    ].join('\n\n---\n\n');

    const tokenUsage: TokenUsage = {
      inputTokens: (llmResponse.usage_metadata?.input_tokens as number) ?? 0,
      outputTokens: (llmResponse.usage_metadata?.output_tokens as number) ?? 0,
      model: 'gemini-2.5-flash',
    };

    const output: ThesisAgentOutput = {
      bullCase: parsed.bullCase || { title: '', keyPoints: [], catalysts: [], targetScenario: '' },
      bearCase: parsed.bearCase || { title: '', keyPoints: [], risks: [], targetScenario: '' },
      investmentThesis: parsed.investmentThesis || {
        recommendation: 'hold',
        summary: '',
        timeHorizon: '1_year',
        keyAssumptions: [],
        whatToWatch: [],
      },
      evidenceGaps: parsed.evidenceGaps || [],
      sectionMarkdown: combinedSectionMarkdown,
      tokenUsage,
    };

    // Emit Bull Case
    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'bull_case',
        title: `Bull Case: ${output.bullCase.title}`,
        content: parsed.bullSectionMarkdown || `## Bull Case\n\n${output.bullCase.keyPoints.map((p) => `- ${p.argument}`).join('\n')}`,
        order: 6,
      },
    });

    // Emit Bear Case
    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'bear_case',
        title: `Bear Case: ${output.bearCase.title}`,
        content: parsed.bearSectionMarkdown || `## Bear Case\n\n${output.bearCase.keyPoints.map((p) => `- ${p.argument}`).join('\n')}`,
        order: 7,
      },
    });

    // Emit Investment Thesis
    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'investment_thesis',
        title: 'Investment Thesis',
        content: parsed.thesisSectionMarkdown || `## Investment Thesis\n\n**Recommendation: ${output.investmentThesis.recommendation.toUpperCase()}**\n\n${output.investmentThesis.summary}`,
        order: 8,
      },
    });

    sseEmitter?.next({
      event: 'phase',
      data: { phase: 'synthesizing', status: 'complete', message: `Thesis: ${output.investmentThesis.recommendation}` },
    });

    console.log(
      `[Thesis] Completed for ${company.ticker} | Recommendation: ${output.investmentThesis.recommendation}`,
    );

    return { thesisOutput: output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Thesis] Error:', message);

    const fallbackMarkdown = `## Investment Thesis\n\n> ⚠️ **Error**: Unable to generate investment thesis.\n\nError: ${message}`;

    ['bull_case', 'bear_case', 'investment_thesis'].forEach((sectionId, i) => {
      sseEmitter?.next({
        event: 'section',
        data: {
          sectionId: sectionId as 'bull_case' | 'bear_case' | 'investment_thesis',
          title: sectionId.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          content: fallbackMarkdown,
          order: 6 + i,
          hasDataGap: true,
        },
      });
    });

    return {
      errors: [`Thesis agent error: ${message}`],
      thesisOutput: {
        bullCase: { title: '', keyPoints: [], catalysts: [], targetScenario: '' },
        bearCase: { title: '', keyPoints: [], risks: [], targetScenario: '' },
        investmentThesis: { recommendation: 'hold', summary: '', timeHorizon: '1_year', keyAssumptions: [], whatToWatch: [] },
        evidenceGaps: ['Thesis generation failed'],
        sectionMarkdown: fallbackMarkdown,
        tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' },
      },
    };
  }
}
