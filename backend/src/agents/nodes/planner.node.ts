/**
 * Planner Agent Node — IndianAPI Edition
 *
 * Responsibilities:
 * 1. Use Gemini to clean/extract the company name from user query
 * 2. Fetch stock data from IndianAPI `/stock?name=` (fuzzy match)
 * 3. Resolve company profile: NSE code, BSE code, ISIN, sector, industry
 * 4. Emit SSE phase event with resolved company details
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ResearchState } from '../state/research-state';
import { IndianApiTool } from '../tools/indian-api.tool';
import { ResolvedCompany } from '../state/research-state';
import { invokeWithRetry, sanitizeJsonString } from '../tools/llm-helper';

const PLANNER_SYSTEM_PROMPT = `You are the Planner Agent for ResearchGPT, an AI-powered Indian equity research system.

Your job is to:
1. Parse the user's research query to identify the target Indian company
2. Confirm the correct NSE/BSE ticker from the stock data provided
3. Return a JSON object with the resolved company information

Always respond with ONLY a valid JSON object in this exact format:
{
  "ticker": "RELIANCE",
  "companyName": "Reliance Industries",
  "exchange": "NSE+BSE",
  "confidence": 0.95,
  "reasoning": "User asked to research Reliance Industries, which maps clearly to RELIANCE on NSE"
}

If you cannot confidently identify a single publicly traded Indian company, set confidence below 0.5.`;

export async function plannerNode(
  state: ResearchState,
): Promise<Partial<ResearchState>> {
  const { runId, rawQuery, sseEmitter } = state;

  sseEmitter?.next({
    event: 'phase',
    data: { phase: 'planning', status: 'started', message: 'Resolving company...' },
  });

  const indianApiKey = process.env.INDIAN_API_KEY!;
  const geminiApiKey = process.env.GCP_API_KEY!;

  const api = new IndianApiTool(indianApiKey);
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: geminiApiKey,
    temperature: 0.1,
  });

  let company: ResolvedCompany | null = null;
  const errors: string[] = [];

  try {
    // ── Step 0: Use Gemini to extract clean company name / ticker ─────────
    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'planner', message: 'Analyzing query...' },
    });

    let cleanedQuery = rawQuery;

    try {
      const cleanPrompt = `You are an expert Indian stock market assistant. Extract the core company name or stock ticker symbol from a user's research query, correcting any spelling mistakes.

Examples:
- "Research Reliance" -> "Reliance Industries"
- "analyse TCS" -> "TCS"
- "Tell me about HDFC Bank" -> "HDFC Bank"
- "Infosys stock" -> "Infosys"
- "research nvidea" -> "NVIDIA" (note: NVIDIA is a US stock, inform if not Indian)
- "TATAMOTORS" -> "Tata Motors"
- "Wipro" -> "Wipro"

Return ONLY the corrected company name or ticker symbol. No quotes, no explanation.`;

      const cleanResponse = await invokeWithRetry(llm, [
        new SystemMessage(cleanPrompt),
        new HumanMessage(`Query: "${rawQuery}"`),
      ], 2, 1000);
      cleanedQuery = String(cleanResponse.content).trim().replace(/['"]/g, '');
      console.log(`[Planner] Cleaned query (Gemini): "${rawQuery}" -> "${cleanedQuery}"`);
    } catch (cleanErr) {
      // Fallback: strip common action words
      cleanedQuery = rawQuery
        .replace(/^(research|analyze|analyse|look up|tell me about|what about|show me|find|get|check|study)\s+/i, '')
        .replace(/['"]/g, '')
        .trim();
      console.warn(`[Planner] Gemini clean failed, regex fallback: "${cleanedQuery}"`);
    }

    // ── Step 1: Fetch stock data from IndianAPI ────────────────────────────
    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'planner', message: `Searching Indian markets for "${cleanedQuery}"...` },
    });

    let stockData = await api.getStock(cleanedQuery).catch(() => null);

    // Fallback: try first word if multi-word query returned nothing
    if (!stockData?.companyName && cleanedQuery.includes(' ')) {
      const firstWord = cleanedQuery.split(' ')[0];
      console.log(`[Planner] Trying first word fallback: "${firstWord}"`);
      stockData = await api.getStock(firstWord).catch(() => null);
    }

    // Fallback: try raw query
    if (!stockData?.companyName && cleanedQuery !== rawQuery) {
      console.log(`[Planner] Trying raw query fallback: "${rawQuery}"`);
      stockData = await api.getStock(rawQuery).catch(() => null);
    }

    if (!stockData?.companyName) {
      errors.push(`No Indian stock found for query: "${rawQuery}"`);
      sseEmitter?.next({
        event: 'error',
        data: {
          message: `Could not find an Indian publicly traded company matching "${cleanedQuery}". Please try the exact NSE symbol (e.g. RELIANCE, TCS, HDFCBANK).`,
          phase: 'planning',
        },
      });
      return { errors };
    }

    // ── Step 2: Extract company identifiers ───────────────────────────────
    const profile = stockData.companyProfile ?? {};
    const nseCode = profile.exchangeCodeNse?.trim() ?? '';
    const bseCode = profile.exchangeCodeBse?.trim() ?? '';
    const isin = profile.isInId?.trim() ?? '';

    // Determine the primary ticker (prefer NSE code)
    const ticker = nseCode || bseCode || cleanedQuery.toUpperCase().replace(/\s+/g, '');

    // Parse current prices
    const priceBse = parseFloat(stockData.currentPrice?.BSE?.replace(/,/g, '') ?? '0') || 0;
    const priceNse = parseFloat(stockData.currentPrice?.NSE?.replace(/,/g, '') ?? '0') || 0;

    // ── Step 3: Confirm with Gemini ───────────────────────────────────────
    sseEmitter?.next({
      event: 'progress',
      data: { agent: 'planner', message: `Confirming: ${stockData.companyName} (${ticker})...` },
    });

    let confirmedTicker = ticker;
    let confirmedName = stockData.companyName ?? cleanedQuery;
    let confirmedExchange = nseCode ? (bseCode ? 'NSE+BSE' : 'NSE') : 'BSE';

    try {
      const jsonLlm = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        apiKey: geminiApiKey,
        temperature: 0.1,
        json: true,
      });
      const llmResponse = await invokeWithRetry(jsonLlm, [
        new SystemMessage(PLANNER_SYSTEM_PROMPT),
        new HumanMessage(
          `User query: "${rawQuery}"\n\nFound company: ${stockData.companyName}\nNSE Code: ${nseCode || 'N/A'}\nBSE Code: ${bseCode || 'N/A'}\nISIN: ${isin || 'N/A'}\nIndustry: ${stockData.industry || 'N/A'}\n\nConfirm this is the correct company.`,
        ),
      ]);

      const responseText = String(llmResponse.content);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sanitizedJson = sanitizeJsonString(jsonMatch[0]);
        const parsed = JSON.parse(sanitizedJson) as {
          ticker: string;
          companyName: string;
          exchange: string;
          confidence: number;
          reasoning: string;
        };
        if (parsed.confidence >= 0.5) {
          // Enforce that confirmedTicker is a clean ticker symbol (no spaces, length <= 12)
          const cleanParsed = parsed.ticker?.trim().toUpperCase();
          if (cleanParsed && !cleanParsed.includes(' ') && cleanParsed.length <= 12) {
            confirmedTicker = cleanParsed;
          } else {
            confirmedTicker = ticker;
          }
          confirmedName = parsed.companyName || confirmedName;
          confirmedExchange = parsed.exchange || confirmedExchange;
          console.log(`[Planner] Gemini confirmed: ${confirmedName} (${confirmedTicker}) | Confidence: ${parsed.confidence}`);
        } else {
          console.warn(`[Planner] Low confidence (${parsed.confidence}): ${parsed.reasoning}`);
        }
      }
    } catch (llmErr) {
      console.warn(`[Planner] Gemini confirmation skipped: ${String(llmErr)}`);
    }

    // Parse key metrics for market cap
    const keyMetrics = IndianApiTool.parseKeyMetrics(stockData.keyMetrics);
    const marketCapStr = String(keyMetrics['Market Cap'] ?? keyMetrics['Mkt Cap'] ?? keyMetrics['marketCap'] ?? '');
    const marketCapCr = parseFloat(marketCapStr.replace(/[₹,\s]/g, '')) || undefined;

    company = {
      ticker: confirmedTicker,
      companyName: confirmedName,
      exchange: confirmedExchange,
      sector: stockData.industry ?? 'Unknown',
      industry: stockData.industry ?? 'Unknown',
      description: profile.companyDescription,
      ceo: IndianApiTool.parsePsObject(profile.officers)?.officer?.[0]?.name,
      marketCap: marketCapCr,
      nseCode: nseCode || undefined,
      bseCode: bseCode || undefined,
      isin: isin || undefined,
      currentPriceBse: priceBse || undefined,
      currentPriceNse: priceNse || undefined,
    };

    sseEmitter?.next({
      event: 'phase',
      data: {
        phase: 'planning',
        status: 'complete',
        message: `Resolved: ${company.companyName} (${company.ticker}) — ${company.industry} | NSE: ₹${priceNse} | BSE: ₹${priceBse}`,
      },
    });

    console.log(
      `[Planner] Resolved "${rawQuery}" → ${company.ticker} (${company.companyName}) | NSE: ${nseCode} | BSE: ${bseCode} | ISIN: ${isin}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Planner agent error: ${message}`);
    console.error('[Planner] Error:', message);
  }

  return { company, errors };
}
