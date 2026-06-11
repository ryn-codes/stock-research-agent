/**
 * ResearchGPT — LangGraph Shared State
 *
 * The single mutable state object that flows through the research graph.
 * All agent nodes read from and write to this state via LangGraph's
 * Annotation system (reducer-based immutable updates).
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { Subject } from 'rxjs';
import {
  Evidence,
  FinancialAgentOutput,
  NewsAgentOutput,
  CompetitiveAgentOutput,
  ThesisAgentOutput,
  ReportSection,
  ConfidenceScore,
  Citation,
  SseEvent,
} from '../types/agent-types';

/**
 * Resolved company information from the Planner agent.
 */
export interface ResolvedCompany {
  ticker: string;          // NSE code (e.g. RELIANCE, TCS, HDFCBANK)
  companyName: string;
  exchange: string;        // 'NSE' | 'BSE' | 'NSE+BSE'
  sector: string;
  industry: string;
  description?: string;
  ceo?: string;
  website?: string;
  marketCap?: number;      // in ₹ Crores
  ipoDate?: string;
  // Indian market specific
  nseCode?: string;        // NSE ticker symbol
  bseCode?: string;        // BSE numeric code
  isin?: string;           // ISIN number (e.g. INE002A01018)
  currentPriceBse?: number;
  currentPriceNse?: number;
}

/**
 * LangGraph State for the research pipeline.
 * Each field uses a reducer to define how values are merged on update.
 */
export const ResearchStateAnnotation = Annotation.Root({
  // ---- Conversation messages (for LLM context) ----
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),

  // ---- Core research context ----
  runId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  rawQuery: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // ---- Planner output — resolved company info ----
  company: Annotation<ResolvedCompany | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ---- Agent outputs (set once each agent completes) ----
  financialOutput: Annotation<FinancialAgentOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  newsOutput: Annotation<NewsAgentOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  competitiveOutput: Annotation<CompetitiveAgentOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  thesisOutput: Annotation<ThesisAgentOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ---- Evidence pool (accumulated from all agents) ----
  evidence: Annotation<Evidence[]>({
    reducer: (existing, next) => [...existing, ...next],
    default: () => [],
  }),

  // ---- Report assembly ----
  reportSections: Annotation<ReportSection[]>({
    reducer: (existing, next) => {
      // Merge by sectionId — later writes win
      const map = new Map(existing.map((s) => [s.sectionId, s]));
      next.forEach((s) => map.set(s.sectionId, s));
      return Array.from(map.values()).sort(
        (a, b) => a.sectionOrder - b.sectionOrder,
      );
    },
    default: () => [],
  }),

  confidenceScore: Annotation<ConfidenceScore | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  citations: Annotation<Citation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  reportId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ---- Error tracking ----
  errors: Annotation<string[]>({
    reducer: (existing, next) => [...existing, ...next],
    default: () => [],
  }),

  // ---- SSE emitter — injected before graph execution ----
  // This is NOT serializable and must not be checkpointed.
  // It's used to push real-time events to the SSE client.
  sseEmitter: Annotation<Subject<SseEvent> | null>({
    reducer: (existing, next) => next ?? existing,
    default: () => null,
  }),
});

export type ResearchState = typeof ResearchStateAnnotation.State;
