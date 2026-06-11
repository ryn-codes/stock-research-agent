/**
 * Financial Agent Node — IndianAPI Edition
 *
 * Responsibilities:
 * 1. Fetch stock financial data via IndianApiTool
 * 2. Compute derived financial metrics in ₹ Crores
 * 3. Use Gemini to write the Financial Analysis section markdown
 * 4. Emit SSE section event with the generated markdown
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ResearchState } from '../state/research-state';
import { IndianApiTool } from '../tools/indian-api.tool';
import { ScreenerTool } from '../tools/screener.tool';
import { invokeWithRetry } from '../tools/llm-helper';
import {
  computeDerivedMetricsFromIndianApi,
  buildQuarterlyDataFromIndianApi,
  buildBalanceSheetFromIndianApi,
  buildCashFlowFromIndianApi,
  formatCurrency,
  formatPercent,
  formatRatio,
} from '../tools/financial-calculator.tool';
import {
  Evidence,
  FinancialAgentOutput,
  TokenUsage,
} from '../types/agent-types';
import { v4 as uuidv4 } from 'uuid';

const FINANCIAL_SYSTEM_PROMPT = `You are the Financial Analysis Agent for ResearchGPT. You write the Financial Analysis section of an equity research report.

Write a comprehensive, data-driven Financial Analysis section in professional markdown format. Include:
1. Current trading data and valuation (BSE/NSE prices, market cap, P/E)
2. Revenue and profitability trends (use the financial data/periods provided in ₹ Crores)
3. Balance sheet strength assessment (debt-to-equity, cash levels)
4. Cash flow quality and capital allocation
5. Key financial ratios with context
6. Notable trends or inflection points
7. Screener.in Insights: incorporate the Pros and Cons from the provided Screener.in grounding data under a sub-heading "### Screener.in Financial Insights".

Format with headers (##), use markdown tables for trend data where appropriate. Use ₹ (INR) and Indian numbering system units (Crores/Lakhs) where appropriate.
Be specific — cite the actual numbers in Crores. Write 400-600 words.
Always cite your financial data points, ratios, or grounding facts by linking directly to the source URL using standard markdown format: [Source Name](URL). For example: [Screener.in](https://www.screener.in/company/TIPSMUSIC/) or [IndianAPI](https://stock.indianapi.in/stock?name=...). Use the exact URLs provided in the context.
Do NOT use placeholder text. Do NOT add disclaimers.`;

export async function financialNode(
  state: ResearchState,
): Promise<Partial<ResearchState>> {
  const { runId, company, sseEmitter } = state;

  if (!company) {
    return { errors: ['Financial agent: company not resolved by planner'] };
  }

  sseEmitter?.next({
    event: 'progress',
    data: { agent: 'financial', message: `Fetching financial data for ${company.companyName}...` },
  });

  const indianApiKey = process.env.INDIAN_API_KEY!;
  const geminiApiKey = process.env.GCP_API_KEY!;

  const api = new IndianApiTool(indianApiKey);
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: geminiApiKey,
    temperature: 0.3,
  });

  const evidence: Evidence[] = [];
  let hasDataGap = false;

  try {
    // Fetch stock data from IndianAPI
    // Enforce clean ticker lookup, fallback to nseCode, bseCode, or companyName
    const lookupKey = (company.ticker && !company.ticker.includes(' ') && company.ticker.length <= 12)
      ? company.ticker
      : (company.nseCode || company.bseCode || company.companyName);

    // Fetch Screener.in grounding data
    const screenerData = await ScreenerTool.getCompanyData(lookupKey).catch(() => null);

    const stockData = await api.getStock(lookupKey);

    if (!stockData || !stockData.companyName) {
      throw new Error(`Failed to fetch stock data for ${lookupKey}`);
    }

    const priceBse = parseFloat(stockData.currentPrice?.BSE?.replace(/,/g, '') ?? '0') || company.currentPriceBse || 0;
    const priceNse = parseFloat(stockData.currentPrice?.NSE?.replace(/,/g, '') ?? '0') || company.currentPriceNse || 0;
    const currentPrice = priceNse || priceBse || 0;

    const keyMetrics = IndianApiTool.parseKeyMetrics(stockData.keyMetrics);
    const peRatio = parseFloat(String(
      keyMetrics['pPerEBasicExcludingExtraordinaryItemsTTM'] ??
      keyMetrics['pPerEIncludingExtraordinaryItemsTTM'] ??
      keyMetrics['pPerEExcludingExtraordinaryItemsMostRecentFiscalYear'] ??
      keyMetrics['pPerENormalizedMostRecentFiscalYear'] ??
      keyMetrics['P/E'] ??
      keyMetrics['PE'] ??
      ''
    )) || null;

    const divYield = parseFloat(String(
      keyMetrics['currentDividendYieldCommonStockPrimaryIssueLTM'] ??
      keyMetrics['dividendYieldIndicatedAnnualDividendDividedByClosingprice'] ??
      keyMetrics['Dividend Yield'] ??
      keyMetrics['Div Yield'] ??
      ''
    )) || null;

    const week52High = parseFloat(String(stockData.yearHigh ?? '0').replace(/,/g, '')) || 0;
    const week52Low = parseFloat(String(stockData.yearLow ?? '0').replace(/,/g, '')) || 0;
    const changePercent = parseFloat(String(stockData.percentChange ?? '0').replace(/[+%]/g, '')) || 0;

    const financials = IndianApiTool.parseFinancials(stockData.financials as any[]);
    if (financials.length === 0) {
      hasDataGap = true;
    }

    const latestFinancialMap = financials[0]?.stockFinancialMap ?? {};

    // Build structured output datasets
    const financialSummary = {
      currentPrice,
      marketCap: company.marketCap ?? 0,
      peRatio,
      week52High,
      week52Low,
      dividendYield: divYield,
      change: 0,
      changePercent,
    };

    const incomeStatementTrend = buildQuarterlyDataFromIndianApi(financials);
    const balanceSheetSnapshot = buildBalanceSheetFromIndianApi(latestFinancialMap);
    const cashFlowSummary = buildCashFlowFromIndianApi(latestFinancialMap);
    const derivedMetrics = computeDerivedMetricsFromIndianApi(financials, currentPrice, company.marketCap ?? null);

    // Check for gaps
    if (currentPrice === 0) hasDataGap = true;
    if (financials.length < 2) hasDataGap = true;

    // Collect evidence
    evidence.push({
      id: uuidv4(),
      runId,
      sourceAgent: 'financial',
      evidenceType: 'financial_metric',
      content: `${company.companyName} current price: NSE ₹${priceNse} | BSE ₹${priceBse} | Market Cap: ${formatCurrency(company.marketCap, true)} | P/E: ${peRatio?.toFixed(1) ?? 'N/A'} | 52W Range: ₹${week52Low}–₹${week52High}`,
      structuredData: stockData.currentPrice as unknown as Record<string, unknown>,
      sourceUrl: `https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}`,
      sourceName: 'IndianAPI Stock Search',
      confidence: 0.95,
      relevanceScore: 1.0,
      collectedAt: new Date().toISOString(),
    });

    if (financials.length > 0) {
      const latest = financials[0];
      evidence.push({
        id: uuidv4(),
        runId,
        sourceAgent: 'financial',
        evidenceType: 'financial_trend',
        content: `${company.companyName} FY${latest.FiscalYear} financial details: Total Revenue ₹${latestFinancialMap['Total Revenue'] ?? 'N/A'} Cr | Net Income ₹${latestFinancialMap['Net Income'] ?? 'N/A'} Cr`,
        structuredData: { financials: financials.slice(0, 3) } as unknown as Record<string, unknown>,
        sourceUrl: `https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}`,
        sourceName: 'IndianAPI Financials',
        confidence: 0.95,
        relevanceScore: 1.0,
        collectedAt: new Date().toISOString(),
        dataAsOf: latest.EndDate || undefined,
      });
    }

    if (screenerData) {
      // Extract clean text of pros and cons
      const cleanPros = screenerData.prosHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanCons = screenerData.consHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      evidence.push({
        id: uuidv4(),
        runId,
        sourceAgent: 'financial',
        evidenceType: 'financial_trend',
        content: `Screener.in analysis for ${company.companyName}. Pros: ${cleanPros || 'None'}. Cons: ${cleanCons || 'None'}.`,
        structuredData: { url: screenerData.url } as any,
        sourceUrl: screenerData.url,
        sourceName: 'Screener.in Profile',
        confidence: 0.95,
        relevanceScore: 1.0,
        collectedAt: new Date().toISOString(),
      });
    }

    // Prepare prompt context
    const quarterlyTable = incomeStatementTrend
      .map(
        (q) =>
          `| ${q.period} | ${formatCurrency(q.revenue)} | ${formatCurrency(q.grossProfit)} | ${formatCurrency(q.operatingIncome)} | ${formatCurrency(q.netIncome)} |`,
      )
      .join('\n');

    const financialContext = `
Company: ${company.companyName} (${company.ticker}) — ${company.sector} / ${company.industry}

SOURCE URLS FOR INLINE CITATIONS:
- Screener.in Company URL: ${screenerData ? screenerData.url : 'None'}
- IndianAPI Stock URL: https://stock.indianapi.in/stock?name=${encodeURIComponent(company.companyName)}

CURRENT PRICE DATA:
- NSE Price: ₹${priceNse}
- BSE Price: ₹${priceBse}
- Market Cap: ${formatCurrency(financialSummary.marketCap, true)}
- P/E Ratio: ${peRatio?.toFixed(1) ?? 'N/A'}
- Dividend Yield: ${divYield != null ? formatPercent(divYield) : 'N/A'}
- 52-Week Range: ₹${financialSummary.week52Low} – ₹${financialSummary.week52High}

FINANCIAL HISTORY (₹ Crores):
| Period | Revenue | Gross Profit / Op. Profit | Operating Income | Net Income |
|--------|---------|---------------------------|-----------------|-----------|
${quarterlyTable || '| No data available | | | | |'}

DERIVED METRICS:
- Revenue Growth YoY: ${formatPercent(derivedMetrics.revenueGrowthYoY)}
- Gross Margin: ${formatPercent(derivedMetrics.grossMargin)}
- Operating Margin: ${formatPercent(derivedMetrics.operatingMargin)}
- Net Margin: ${formatPercent(derivedMetrics.netMargin)}
- Free Cash Flow Yield: ${formatPercent(derivedMetrics.freeCashFlowYield)}
- Debt/Equity: ${formatRatio(derivedMetrics.debtToEquity)}
- Return on Equity: ${formatPercent(derivedMetrics.returnOnEquity)}

BALANCE SHEET SNAPSHOT (₹ Crores):
- Total Assets: ${formatCurrency(balanceSheetSnapshot.totalAssets, true)}
- Total Debt: ${formatCurrency(balanceSheetSnapshot.totalDebt, true)}
- Cash & Equivalents: ${formatCurrency(balanceSheetSnapshot.cashAndEquivalents, true)}
- Total Equity: ${formatCurrency(balanceSheetSnapshot.totalEquity, true)}

CASH FLOW SUMMARY (₹ Crores):
- Operating Cash Flow: ${formatCurrency(cashFlowSummary.operatingCashFlow, true)}
- CapEx: ${formatCurrency(cashFlowSummary.capitalExpenditures, true)}
- Free Cash Flow: ${formatCurrency(cashFlowSummary.freeCashFlow, true)}
- Dividends Paid: ${formatCurrency(cashFlowSummary.dividendsPaid, true)}

${screenerData ? `
SCREENER.IN GROUNDING DATA (HTML/TABLES):
- Ratios list: ${screenerData.ratiosHtml}
- Pros of the company: ${screenerData.prosHtml}
- Cons of the company: ${screenerData.consHtml}
- Quarterly results: ${screenerData.quartersHtml}
- Profit & Loss (annual): ${screenerData.profitLossHtml}
- Balance sheet details: ${screenerData.balanceSheetHtml}
- Cash Flow details: ${screenerData.cashFlowHtml}
` : ''}

${hasDataGap ? '\n⚠️ NOTE: Some financial data was unavailable. Note gaps explicitly.' : ''}`;

    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'financial', message: 'Writing Financial Analysis section...' },
    });

    const llmResponse = await invokeWithRetry(llm, [
      new SystemMessage(FINANCIAL_SYSTEM_PROMPT),
      new HumanMessage(financialContext),
    ]);

    const sectionMarkdown = String(llmResponse.content);

    const tokenUsage: TokenUsage = {
      inputTokens: (llmResponse.usage_metadata?.input_tokens as number) ?? 0,
      outputTokens: (llmResponse.usage_metadata?.output_tokens as number) ?? 0,
      model: 'gemini-2.5-flash',
    };

    const output: FinancialAgentOutput = {
      evidence,
      financialSummary,
      incomeStatementTrend,
      balanceSheetSnapshot,
      cashFlowSummary,
      derivedMetrics,
      sectionMarkdown,
      tokenUsage,
      hasDataGap,
    };

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'financial_analysis',
        title: 'Financial Analysis',
        content: sectionMarkdown,
        order: 3,
        hasDataGap,
      },
    });

    console.log(
      `[Financial] Completed for ${company.ticker} | Tokens: ${tokenUsage.inputTokens}+${tokenUsage.outputTokens}`,
    );

    return { financialOutput: output, evidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Financial] Error:', message);

    const fallbackMarkdown = `## Financial Analysis\n\n> ⚠️ **Data Gap**: Unable to retrieve complete financial data for ${company.companyName} (${company.ticker}). This section could not be generated.\n\nError: ${message}`;

    sseEmitter?.next({
      event: 'section',
      data: {
        sectionId: 'financial_analysis',
        title: 'Financial Analysis',
        content: fallbackMarkdown,
        order: 3,
        hasDataGap: true,
      },
    });

    return {
      errors: [`Financial agent error: ${message}`],
      financialOutput: {
        evidence: [],
        financialSummary: {
          currentPrice: 0, marketCap: 0, peRatio: null, week52High: 0,
          week52Low: 0, dividendYield: null, change: 0, changePercent: 0,
        },
        incomeStatementTrend: [],
        balanceSheetSnapshot: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, cashAndEquivalents: 0, totalDebt: 0, currentRatio: 0 },
        cashFlowSummary: { operatingCashFlow: 0, capitalExpenditures: 0, freeCashFlow: 0, dividendsPaid: 0 },
        derivedMetrics: { revenueGrowthYoY: null, grossMargin: null, operatingMargin: null, netMargin: null, freeCashFlowYield: null, debtToEquity: null, currentRatio: null, returnOnEquity: null },
        sectionMarkdown: fallbackMarkdown,
        tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' },
        hasDataGap: true,
      },
    };
  }
}
