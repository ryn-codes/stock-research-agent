/**
 * IndianAPI Tool — indian stock market (indianapi.in)
 *
 * Typed wrapper for all IndianAPI endpoints used by the research agents.
 * Authentication: x-api-key header.
 * Base URL: https://stock.indianapi.in
 * Includes retry logic with exponential backoff (3 retries, 1s/2s/4s).
 */

import axios, { AxiosInstance } from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IndianApiOfficer {
  name?: string;
  title?: string;
}

export interface IndianApiCompanyProfile {
  companyDescription?: string;
  mgIndustry?: string;
  isInId?: string;       // ISIN
  officers?: { officer?: IndianApiOfficer[] };
  exchangeCodeBse?: string;
  exchangeCodeNse?: string;
  peerCompanyList?: string;
}

export interface IndianApiTechnicalData {
  days: number;
  bsePrice: number;
  nsePrice: number;
}

export interface IndianApiFinancialMap {
  [key: string]: string | number | null;
}

export interface IndianApiFinancialEntry {
  stockFinancialMap?: IndianApiFinancialMap;
  FiscalYear?: number;
  EndDate?: string;
  Type?: string;
}

export interface IndianApiKeyMetrics {
  [key: string]: string | number | null;
}

export interface IndianApiShareholding {
  promoters?: number | string;
  fii?: number | string;
  dii?: number | string;
  retail?: number | string;
  others?: number | string;
  date?: string;
}

export interface IndianApiNewsArticle {
  id?: number | string;
  headline?: string;
  date?: string;
  summary?: string;
  url?: string;
  source?: string;
  listimage?: string;
}

export interface IndianApiAnalystView {
  buy?: number;
  sell?: number;
  hold?: number;
  strongBuy?: number;
  strongSell?: number;
  consensus?: string;
}

export interface IndianApiCorporateAction {
  purpose?: string;
  exDate?: string;
  recordDate?: string;
  paymentDate?: string;
  amount?: number | string;
  type?: string;
}

export interface IndianApiStockResponse {
  companyName?: string;
  industry?: string;
  currentPrice?: { BSE?: string; NSE?: string };
  percentChange?: string;
  yearHigh?: string;
  yearLow?: string;
  companyProfile?: IndianApiCompanyProfile;
  stockTechnicalData?: IndianApiTechnicalData[] | string[];
  financials?: IndianApiFinancialEntry[] | string[];
  keyMetrics?: IndianApiKeyMetrics | string | { [key: string]: any };
  shareholding?: IndianApiShareholding | any;
  recentNews?: IndianApiNewsArticle[] | string[];
  analystView?: IndianApiAnalystView | any;
  riskMeter?: string | any;
  recosBar?: any;
  stockCorporateActionData?: IndianApiCorporateAction[] | string[] | any;
  stockFinancialData?: any;
  initialStockFinancialData?: any;
  stockDetailsReusableData?: any;
}

export interface IndianApiNewsItem {
  title?: string;
  summary?: string;
  url?: string;
  image_url?: string;
  pub_date?: string;
  source?: string;
  topics?: string[];
}

export interface IndianApiTrendingStock {
  ticker_id?: string;
  company_name?: string;
  price?: number;
  percent_change?: number;
  net_change?: number;
  volume?: number;
  year_high?: number;
  year_low?: number;
  overall_rating?: string;
  short_term_trends?: string;
  long_term_trends?: string;
  exchange_type?: string;
}

export interface IndianApiTrendingResponse {
  trending_stocks?: {
    top_gainers?: (IndianApiTrendingStock | string)[];
    top_losers?: (IndianApiTrendingStock | string)[];
    most_active?: (IndianApiTrendingStock | string)[];
  };
}

export interface IndianApiHistoricalResponse {
  datasets?: Array<{
    metric?: string;
    label?: string;
    values?: string[];
  }>;
}

export interface IndianApiIndustryStock {
  name?: string;
  ticker?: string;
  nseCode?: string;
  bseCode?: string;
  price?: number | string;
  marketCap?: number | string;
}

export interface IndianApiTargetPrice {
  targetHigh?: string | number;
  targetLow?: string | number;
  targetMean?: string | number;
  targetMedian?: string | number;
  consensus?: string;
  analystCount?: number | string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Class
// ─────────────────────────────────────────────────────────────────────────────

export class IndianApiTool {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://stock.indianapi.in') {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 20000,
      headers: { 'x-api-key': apiKey },
    });
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const maxRetries = 3;
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.get<T>(path, { params });
        return response.data;
      } catch (error: unknown) {
        const isAxiosError =
          typeof error === 'object' && error !== null && 'response' in error;

        if (isAxiosError) {
          const axiosErr = error as { response?: { status?: number; data?: any }; message?: string };
          const status = axiosErr.response?.status;
          // Don't retry on client errors
          if (status === 401 || status === 403 || status === 404 || status === 422) {
            console.error(`[IndianAPI] Client error ${status} for ${path}:`, axiosErr.response?.data);
            throw new Error(`IndianAPI error ${status} for ${path}: ${JSON.stringify(axiosErr.response?.data)}`);
          }
        }

        if (attempt === maxRetries) {
          const msg = (error as any)?.message ?? String(error);
          throw new Error(`IndianAPI failed after ${maxRetries + 1} attempts for ${path}: ${msg}`);
        }
        console.warn(`[IndianAPI] Attempt ${attempt + 1} failed for ${path}, retrying in ${delays[attempt]}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    throw new Error('Unreachable');
  }

  /**
   * Primary endpoint: Fetch complete stock data by name (fuzzy matched).
   * Returns company profile, pricing, financials, news, shareholding, etc.
   */
  async getStock(name: string): Promise<IndianApiStockResponse> {
    return this.request<IndianApiStockResponse>('/stock', { name });
  }

  /**
   * Fetch historical price/ratio data.
   * filter: 'price' | 'pe' | 'sm' | 'evebitda' | 'ptb' | 'mcs' | 'default'
   * period: '1m' | '3m' | '6m' | '1y' | '3y' | '5y'
   */
  async getHistoricalData(
    stockName: string,
    filter: 'price' | 'pe' | 'sm' | 'evebitda' | 'ptb' | 'mcs' | 'default' = 'price',
    period: string = '1y',
  ): Promise<IndianApiHistoricalResponse> {
    return this.request<IndianApiHistoricalResponse>('/historical_data', {
      stock_name: stockName,
      filter,
      period,
    });
  }

  /**
   * Fetch financial statements (income / balance sheet / cash flow).
   * stats: 'income_statement' | 'balance_sheet' | 'cash_flow'
   * period: 'annual' | 'quarterly'
   */
  async getStatement(
    stockName: string,
    stats: 'income_statement' | 'balance_sheet' | 'cash_flow' = 'income_statement',
    period: 'annual' | 'quarterly' = 'annual',
  ): Promise<any> {
    return this.request<any>('/statement', {
      stock_name: stockName,
      stats,
      period,
    });
  }

  /**
   * Search for companies by industry / sector.
   */
  async getIndustryPeers(industry: string): Promise<IndianApiIndustryStock[]> {
    try {
      const result = await this.request<any>('/industry_search', { industry });
      // Response may be an array or object with companies list
      if (Array.isArray(result)) return result as IndianApiIndustryStock[];
      if (result?.companies) return result.companies as IndianApiIndustryStock[];
      if (result?.data) return result.data as IndianApiIndustryStock[];
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Analyst price target data.
   */
  async getStockTargetPrice(name: string): Promise<IndianApiTargetPrice | null> {
    try {
      return this.request<IndianApiTargetPrice>('/stock_target_price', { name });
    } catch {
      return null;
    }
  }

  /**
   * Recent corporate announcements.
   */
  async getRecentAnnouncements(stockName: string): Promise<any[]> {
    try {
      const result = await this.request<any>('/recent_announcements', { stock_name: stockName });
      return Array.isArray(result) ? result : (result?.data ?? []);
    } catch {
      return [];
    }
  }

  /**
   * Dividend / bonus / split history.
   */
  async getCorporateActions(stockName: string): Promise<IndianApiCorporateAction[]> {
    try {
      const result = await this.request<any>('/corporate_actions', { stock_name: stockName });
      return Array.isArray(result) ? result : (result?.data ?? []);
    } catch {
      return [];
    }
  }

  /**
   * Analyst forecasts / estimates.
   */
  async getStockForecasts(stockName: string): Promise<any> {
    try {
      return this.request<any>('/stock_forecasts', { stock_name: stockName });
    } catch {
      return null;
    }
  }

  /**
   * 52-week high/low data.
   */
  async get52WeekHighLow(stockName: string): Promise<any> {
    try {
      return this.request<any>('/fetch_52_week_high_low_data', { stock_name: stockName });
    } catch {
      return null;
    }
  }

  /**
   * General market news feed.
   */
  async getNews(): Promise<IndianApiNewsItem[]> {
    try {
      const result = await this.request<any>('/news');
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  /**
   * Trending stocks: top gainers, losers, most active.
   */
  async getTrendingStocks(): Promise<IndianApiTrendingResponse> {
    try {
      return this.request<IndianApiTrendingResponse>('/trending');
    } catch {
      return {};
    }
  }

  /**
   * BSE most active stocks.
   */
  async getBseMostActive(): Promise<any[]> {
    try {
      const result = await this.request<any>('/BSE_most_active');
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  /**
   * NSE most active stocks.
   */
  async getNseMostActive(): Promise<any[]> {
    try {
      const result = await this.request<any>('/NSE_most_active');
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Parse PowerShell-style "@{...}" objects from API responses
  // The IndianAPI sometimes returns nested objects serialized as strings.
  // ─────────────────────────────────────────────────────────────────────────
  static parsePsObject(value: any): any {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') return value;
    // Try JSON first
    try { return JSON.parse(value); } catch {}
    // Parse PowerShell @{key=val; key2=val2} format
    const psMatch = value.match(/^@\{(.+)\}$/s);
    if (psMatch) {
      const result: Record<string, any> = {};
      const pairs = psMatch[1].split(';');
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        result[k] = v === '' ? null : v;
      }
      return result;
    }
    return value;
  }

  static parseKeyMetrics(raw: any): Record<string, string | number | null> {
    const parsed = IndianApiTool.parsePsObject(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const flat: Record<string, string | number | null> = {};
      for (const groupName of Object.keys(parsed)) {
        const value = parsed[groupName];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object') {
              const itemKey = item.key;
              const itemDisplayName = item.displayName;
              const itemVal = item.value;
              if (itemKey != null) {
                flat[itemKey] = itemVal;
              }
              if (itemDisplayName != null) {
                flat[itemDisplayName] = itemVal;
              }
            }
          }
        } else if (value !== null && typeof value !== 'object') {
          flat[groupName] = value;
        }
      }
      return flat;
    }
    return {};
  }

  /**
   * Parse shareholding from stock response.
   */
  static parseShareholding(raw: any): { promoters: number; fii: number; dii: number; retail: number; others: number } {
    const parsed = IndianApiTool.parsePsObject(raw);
    const toNum = (v: any): number => {
      const n = parseFloat(String(v ?? '0').replace('%', ''));
      return isNaN(n) ? 0 : n;
    };
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        promoters: toNum(parsed.promoters ?? parsed.Promoters ?? parsed.promoter),
        fii: toNum(parsed.fii ?? parsed.FII ?? parsed.foreignInstitutional),
        dii: toNum(parsed.dii ?? parsed.DII ?? parsed.domesticInstitutional),
        retail: toNum(parsed.retail ?? parsed.Retail ?? parsed.public),
        others: toNum(parsed.others ?? parsed.Others ?? 0),
      };
    }
    return { promoters: 0, fii: 0, dii: 0, retail: 0, others: 0 };
  }

  /**
   * Parse financials array from stock response — extract multi-year annual data.
   */
  static parseFinancials(raw: any[]): IndianApiFinancialEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry: any) => IndianApiTool.parsePsObject(entry))
      .filter((e) => typeof e === 'object' && e !== null)
      .map((e) => {
        const rawMap = IndianApiTool.parsePsObject(e.stockFinancialMap ?? e.financialMap ?? {});
        const stockFinancialMap: Record<string, string | number | null> = {};
        
        if (typeof rawMap === 'object' && rawMap !== null) {
          for (const key of Object.keys(rawMap)) {
            const val = rawMap[key];
            if (Array.isArray(val)) {
              for (const item of val) {
                if (item && typeof item === 'object') {
                  const itemKey = item.key?.trim();
                  const itemDisplayName = item.displayName?.trim();
                  const itemVal = item.value;
                  if (itemKey) {
                    stockFinancialMap[itemKey] = itemVal;
                  }
                  if (itemDisplayName) {
                    stockFinancialMap[itemDisplayName] = itemVal;
                  }
                }
              }
            } else if (val !== null && typeof val !== 'object') {
              stockFinancialMap[key] = val;
            }
          }
        }

        return {
          FiscalYear: Number(e.FiscalYear ?? e.fiscalYear ?? 0),
          EndDate: e.EndDate ?? e.endDate ?? '',
          Type: e.Type ?? e.type ?? 'Annual',
          stockFinancialMap,
        };
      }) as IndianApiFinancialEntry[];
  }

  /**
   * Parse technical data (moving averages) from stock response.
   */
  static parseTechnicalData(raw: any[]): IndianApiTechnicalData[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry: any) => IndianApiTool.parsePsObject(entry))
      .filter((e) => typeof e === 'object' && e !== null)
      .map((e) => ({
        days: Number(e.days ?? 0),
        bsePrice: parseFloat(String(e.bsePrice ?? e.BSEPrice ?? '0')),
        nsePrice: parseFloat(String(e.nsePrice ?? e.NSEPrice ?? '0')),
      }));
  }
}
