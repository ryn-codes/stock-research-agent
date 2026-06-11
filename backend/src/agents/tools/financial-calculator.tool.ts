/**
 * Financial Calculator Tool
 * Pure TypeScript — computes derived financial metrics.
 * Updated for IndianAPI data: INR-denominated, values in Crores (10M).
 * All operations are division-by-zero safe; returns null for uncomputable metrics.
 */

import { DerivedMetrics, QuarterlyData, BalanceSheetData, CashFlowData } from '../types/agent-types';

function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    numerator == null ||
    denominator == null ||
    denominator === 0 ||
    !isFinite(denominator)
  ) {
    return null;
  }
  const result = numerator / denominator;
  return isFinite(result) ? result : null;
}

function toPercent(ratio: number | null): number | null {
  return ratio != null ? Math.round(ratio * 10000) / 100 : null;
}

/**
 * Parse a numeric value safely from any input (string, number, null).
 */
export function parseNum(val: any): number | null {
  if (val == null || val === '' || val === 'N/A' || val === '-') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Compute derived financial metrics from IndianAPI annual financial data.
 * Values are in ₹ Crores.
 */
export function computeDerivedMetricsFromIndianApi(
  financials: Array<{ FiscalYear?: number; stockFinancialMap?: Record<string, any> }>,
  currentPriceNse: number,
  marketCapCr: number | null,
): DerivedMetrics {
  if (!financials || financials.length === 0) {
    return {
      revenueGrowthYoY: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      freeCashFlowYield: null,
      debtToEquity: null,
      currentRatio: null,
      returnOnEquity: null,
    };
  }

  // Sort by fiscal year descending
  const sorted = [...financials].sort(
    (a, b) => (b.FiscalYear ?? 0) - (a.FiscalYear ?? 0),
  );

  const latest = sorted[0]?.stockFinancialMap ?? {};
  const prior = sorted[1]?.stockFinancialMap ?? {};

  // Revenue (Total Revenue / Net Sales / Revenue from Operations)
  const latestRevenue = parseNum(latest['Total Revenue'] ?? latest['Revenue'] ?? latest['Net Sales'] ?? latest['Revenue from Operations']);
  const priorRevenue = parseNum(prior['Total Revenue'] ?? prior['Revenue'] ?? prior['Net Sales'] ?? prior['Revenue from Operations']);

  const revenueGrowthYoY = toPercent(
    safeDivide(
      latestRevenue != null && priorRevenue != null ? latestRevenue - priorRevenue : null,
      priorRevenue,
    ),
  );

  // Net Income / PAT
  const latestNetIncome = parseNum(
    latest['Net Income'] ?? latest['PAT'] ?? latest['Profit after Tax'] ?? latest['Net Profit'],
  );
  const latestEBITDA = parseNum(latest['EBITDA'] ?? latest['Operating Profit']);

  // Operating profit / EBIT
  const latestOperatingProfit = parseNum(
    latest['Operating Profit'] ?? latest['EBIT'] ?? latest['EBITDA'],
  );

  const grossMargin = toPercent(
    safeDivide(
      parseNum(latest['Gross Profit'] ?? latest['Gross Margin']),
      latestRevenue,
    ),
  );
  const operatingMargin = toPercent(safeDivide(latestOperatingProfit, latestRevenue));
  const netMargin = toPercent(safeDivide(latestNetIncome, latestRevenue));

  // Debt/Equity
  const totalDebt = parseNum(latest['Total Debt'] ?? latest['Long Term Borrowings'] ?? latest['Borrowings']);
  const totalEquity = parseNum(latest['Total Equity'] ?? latest['Shareholders Equity'] ?? latest['Net Worth']);
  const debtToEquity = safeDivide(totalDebt, totalEquity);

  // Return on equity (annualized)
  const returnOnEquity = toPercent(safeDivide(latestNetIncome, totalEquity));

  // Free Cash Flow Yield — estimate from OCF - CapEx if available
  const ocf = parseNum(latest['Operating Cash Flow'] ?? latest['Cash from Operations']);
  const capex = parseNum(latest['Capital Expenditure'] ?? latest['CAPEX'] ?? latest['Capex']);
  const fcf = ocf != null && capex != null ? ocf - Math.abs(capex) : null;
  const freeCashFlowYield = toPercent(safeDivide(fcf, marketCapCr));

  return {
    revenueGrowthYoY,
    grossMargin,
    operatingMargin,
    netMargin,
    freeCashFlowYield,
    debtToEquity: debtToEquity != null ? Math.round(debtToEquity * 100) / 100 : null,
    currentRatio: null, // not always available from IndianAPI annual data
    returnOnEquity,
  };
}

/**
 * Build quarterly trend from IndianAPI financial entries.
 */
export function buildQuarterlyDataFromIndianApi(
  financials: Array<{ FiscalYear?: number; EndDate?: string; stockFinancialMap?: Record<string, any> }>,
): QuarterlyData[] {
  const sorted = [...financials]
    .sort((a, b) => (b.FiscalYear ?? 0) - (a.FiscalYear ?? 0))
    .slice(0, 5);

  return sorted.map((entry) => {
    const m = entry.stockFinancialMap ?? {};
    const revenue = parseNum(m['Total Revenue'] ?? m['Revenue'] ?? m['Net Sales'] ?? m['Revenue from Operations']) ?? 0;
    const grossProfit = parseNum(m['Gross Profit']) ?? parseNum(m['Operating Profit']) ?? 0;
    const operatingIncome = parseNum(m['Operating Profit'] ?? m['EBIT'] ?? m['EBITDA']) ?? 0;
    const netIncome = parseNum(m['Net Income'] ?? m['PAT'] ?? m['Profit after Tax'] ?? m['Net Profit']) ?? 0;
    const eps = parseNum(m['EPS'] ?? m['Basic EPS']) ?? 0;

    return {
      period: `FY${entry.FiscalYear ?? '?'}`,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      eps,
    };
  });
}

/**
 * Build balance sheet snapshot from latest IndianAPI financial data.
 */
export function buildBalanceSheetFromIndianApi(
  financialMap: Record<string, any>,
): BalanceSheetData {
  const pn = (k: string[]) => parseNum(k.map((key) => financialMap[key]).find((v) => v != null)) ?? 0;

  return {
    totalAssets: pn(['Total Assets', 'Total Asset']),
    totalLiabilities: pn(['Total Liabilities', 'Total Liability']),
    totalEquity: pn(['Total Equity', 'Shareholders Equity', 'Net Worth']),
    cashAndEquivalents: pn(['Cash and Cash Equivalents', 'Cash & Equivalents', 'Cash']),
    totalDebt: pn(['Total Debt', 'Long Term Borrowings', 'Borrowings', 'Total Borrowings']),
    currentRatio: 0, // Not always available in annual summary
  };
}

/**
 * Build cash flow summary from latest IndianAPI financial data.
 */
export function buildCashFlowFromIndianApi(
  financialMap: Record<string, any>,
): CashFlowData {
  const pn = (k: string[]) => parseNum(k.map((key) => financialMap[key]).find((v) => v != null)) ?? 0;

  const ocf = pn(['Operating Cash Flow', 'Cash from Operations', 'Net Cash from Operations']);
  const capex = Math.abs(pn(['Capital Expenditure', 'CAPEX', 'Capex', 'Purchase of Fixed Assets']));

  return {
    operatingCashFlow: ocf,
    capitalExpenditures: capex,
    freeCashFlow: ocf - capex,
    dividendsPaid: pn(['Dividend Paid', 'Dividends Paid']),
  };
}

/**
 * Format large INR values for human display.
 * Uses Indian numbering: Lakhs (1L = 100K), Crores (1Cr = 10M).
 * Input values are assumed to be in Crores (standard IndianAPI unit).
 */
export function formatCurrency(value: number | null | undefined, inCrores = true): string {
  if (value == null) return 'N/A';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (inCrores) {
    // value is already in Crores
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L Cr`; // Lakh Crore
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(2)}K Cr`;
    return `${sign}₹${abs.toFixed(2)} Cr`;
  } else {
    // raw rupees
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    return `${sign}₹${abs.toLocaleString('en-IN')}`;
  }
}

export function formatPercent(value: number | null): string {
  if (value == null) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatRatio(value: number | null): string {
  if (value == null) return 'N/A';
  return value.toFixed(2) + 'x';
}

// ─── Legacy FMP-compatible exports (kept to avoid breaking thesis/news nodes) ──

export function buildQuarterlyData(statements: any[]): QuarterlyData[] {
  return buildQuarterlyDataFromIndianApi(statements);
}

export function buildBalanceSheetSnapshot(bs: any): BalanceSheetData {
  return buildBalanceSheetFromIndianApi(bs?.stockFinancialMap ?? bs ?? {});
}

export function buildCashFlowSummary(cf: any): CashFlowData {
  return buildCashFlowFromIndianApi(cf?.stockFinancialMap ?? cf ?? {});
}

export function computeDerivedMetrics(
  incomeStatements: any[],
  balanceSheets: any[],
  cashFlows: any[],
  quote: any,
): DerivedMetrics {
  return computeDerivedMetricsFromIndianApi(incomeStatements, quote?.price ?? 0, null);
}
