/**
 * ResearchGPT — Agent Type Definitions
 * Implements all interfaces from Architecture Spec Sections 7 & 8
 */

// ============================================================
// TOKEN USAGE
// ============================================================
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// ============================================================
// EVIDENCE
// ============================================================
export type EvidenceType =
  | 'financial_metric'
  | 'financial_trend'
  | 'news_article'
  | 'news_sentiment'
  | 'material_event'
  | 'competitor_metric'
  | 'competitive_position'
  | 'market_data';

export type SourceAgent = 'financial' | 'news' | 'competitive';

export interface Evidence {
  id: string;
  runId: string;
  sourceAgent: SourceAgent;
  evidenceType: EvidenceType;
  content: string;
  structuredData?: Record<string, unknown> | null;
  sourceUrl: string;
  sourceName?: string;
  confidence: number; // 0.0 to 1.0
  relevanceScore?: number;
  dataAsOf?: string; // ISO 8601
  collectedAt: string; // ISO 8601
}

// ============================================================
// FINANCIAL AGENT
// ============================================================
export interface QuarterlyData {
  period: string; // e.g., "Q1 2026"
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
}

export interface BalanceSheetData {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashAndEquivalents: number;
  totalDebt: number;
  currentRatio: number;
}

export interface CashFlowData {
  operatingCashFlow: number;
  capitalExpenditures: number;
  freeCashFlow: number;
  dividendsPaid: number;
}

export interface DerivedMetrics {
  revenueGrowthYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  freeCashFlowYield: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  returnOnEquity: number | null;
}

export interface FinancialSummary {
  currentPrice: number;
  marketCap: number;
  peRatio: number | null;
  week52High: number;
  week52Low: number;
  dividendYield: number | null;
  change: number;
  changePercent: number;
}

export interface FinancialAgentOutput {
  evidence: Evidence[];
  financialSummary: FinancialSummary;
  incomeStatementTrend: QuarterlyData[];
  balanceSheetSnapshot: BalanceSheetData;
  cashFlowSummary: CashFlowData;
  derivedMetrics: DerivedMetrics;
  sectionMarkdown: string;
  tokenUsage: TokenUsage;
  hasDataGap: boolean;
}

// ============================================================
// NEWS AGENT
// ============================================================
export type SentimentLabel =
  | 'very_negative'
  | 'negative'
  | 'neutral'
  | 'positive'
  | 'very_positive';

export type MaterialEventType =
  | 'earnings'
  | 'acquisition'
  | 'divestiture'
  | 'lawsuit'
  | 'regulatory'
  | 'executive_change'
  | 'product_launch'
  | 'partnership'
  | 'other';

export interface AnalyzedArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO 8601
  summary: string;
  sentiment: number; // -1.0 to 1.0
  relevanceScore: number;
  categories: string[];
}

export interface MaterialEvent {
  type: MaterialEventType;
  headline: string;
  date: string;
  impact: 'positive' | 'negative' | 'neutral';
  significance: 'high' | 'medium' | 'low';
  sourceUrl: string;
}

export interface OverallSentiment {
  score: number; // -1.0 to 1.0
  label: SentimentLabel;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

export interface NewsAgentOutput {
  evidence: Evidence[];
  articles: AnalyzedArticle[];
  overallSentiment: OverallSentiment;
  materialEvents: MaterialEvent[];
  sectionMarkdown: string;
  tokenUsage: TokenUsage;
  hasDataGap: boolean;
}

// ============================================================
// COMPETITIVE AGENT
// ============================================================
export interface CompetitorProfile {
  ticker: string;
  companyName: string;
  marketCap: number;
  description: string;
  overlapAreas: string[];
}

export interface ComparisonMetric {
  metric: string;
  subjectValue: number | string;
  competitors: Record<string, number | string>;
  unit: string;
  subjectRank: number;
}

export interface MoatAssessment {
  type: 'wide' | 'narrow' | 'none';
  sources: string[];
  durability: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface CompetitiveAgentOutput {
  evidence: Evidence[];
  competitors: CompetitorProfile[];
  comparisonTable: ComparisonMetric[];
  competitiveNarrative: string;
  moatAssessment: MoatAssessment;
  sectionMarkdown: string;
  tokenUsage: TokenUsage;
  hasDataGap: boolean;
}

// ============================================================
// THESIS AGENT
// ============================================================
export interface ThesisPoint {
  argument: string;
  supportingEvidence: string[];
  confidence: number;
}

export type RecommendationType =
  | 'strong_buy'
  | 'buy'
  | 'hold'
  | 'sell'
  | 'strong_sell';

export type TimeHorizon =
  | '3_months'
  | '6_months'
  | '1_year'
  | '2_years';

export interface ThesisAgentOutput {
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
  sectionMarkdown: string;
  tokenUsage: TokenUsage;
}

// ============================================================
// REPORT AGENT
// ============================================================
export type SectionId =
  | 'executive_summary'
  | 'business_overview'
  | 'financial_analysis'
  | 'news_analysis'
  | 'competitive_analysis'
  | 'bull_case'
  | 'bear_case'
  | 'investment_thesis'
  | 'confidence_score'
  | 'citations';

export interface ReportSection {
  sectionId: SectionId;
  title: string;
  sectionOrder: number;
  content: string;
  generatedBy: string;
  hasDataGap: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ConfidenceBreakdown {
  financialDataQuality: number;
  newsCoverage: number;
  competitiveAnalysis: number;
  thesisCoherence: number;
  citationDensity: number;
}

export interface ConfidenceScore {
  overall: number; // 0-100
  breakdown: ConfidenceBreakdown;
  rationale: string;
}

export interface Citation {
  displayId: string; // e.g., "[1]"
  title: string;
  sourceName: string;
  url: string;
  citationType:
    | 'financial_data'
    | 'news_article'
    | 'research_report'
    | 'company_filing'
    | 'market_data';
  accessedAt: string;
}

export interface ReportAgentOutput {
  sections: ReportSection[];
  confidenceScore: ConfidenceScore;
  citations: Citation[];
  disclaimer: string;
  tokenUsage: TokenUsage;
}

// ============================================================
// SSE EVENTS
// ============================================================
export type SseEventType =
  | 'phase'
  | 'section'
  | 'progress'
  | 'complete'
  | 'error';

export interface SsePhaseEvent {
  event: 'phase';
  data: {
    phase: 'planning' | 'researching' | 'synthesizing' | 'reporting';
    status: 'started' | 'complete';
    message?: string;
  };
}

export interface SseSectionEvent {
  event: 'section';
  data: {
    sectionId: SectionId;
    title: string;
    content: string;
    order: number;
    hasDataGap?: boolean;
  };
}

export interface SseProgressEvent {
  event: 'progress';
  data: {
    agent: string;
    message: string;
    percent?: number;
  };
}

export interface SseCompleteEvent {
  event: 'complete';
  data: {
    runId: string;
    reportId: string;
    confidenceScore: number;
    totalDurationMs: number;
    citationCount: number;
  };
}

export interface SseErrorEvent {
  event: 'error';
  data: {
    message: string;
    phase?: string;
  };
}

export type SseEvent =
  | SsePhaseEvent
  | SseSectionEvent
  | SseProgressEvent
  | SseCompleteEvent
  | SseErrorEvent;
