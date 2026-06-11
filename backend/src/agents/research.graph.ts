/**
 * ResearchGPT — LangGraph Research Graph
 *
 * Defines the StateGraph that orchestrates all 6 research agents:
 *
 *   START → planner → [financial | news | competitive] (parallel) → thesis → report → END
 *
 * Uses LangGraph's native parallel node execution for the research phase.
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { ResearchStateAnnotation, ResearchState } from './state/research-state';
import { plannerNode } from './nodes/planner.node';
import { financialNode } from './nodes/financial.node';
import { newsNode } from './nodes/news.node';
import { competitiveNode } from './nodes/competitive.node';
import { thesisNode } from './nodes/thesis.node';
import { reportNode } from './nodes/report.node';
import { PrismaService } from '../prisma/prisma.service';
import { Subject } from 'rxjs';
import { SseEvent } from './types/agent-types';

export function buildResearchGraph(prismaService: PrismaService) {
  const graph = new StateGraph(ResearchStateAnnotation)
    // ---- Phase 1: Planning ----
    .addNode('planner', plannerNode)

    // ---- Phase 2: Parallel Research ----
    .addNode('financial', financialNode)
    .addNode('news', newsNode)
    .addNode('competitive', competitiveNode)

    // ---- Phase 3: Synthesis ----
    .addNode('thesis', thesisNode)

    // ---- Phase 4: Report Assembly ----
    .addNode('report', (state: ResearchState) =>
      reportNode(state, prismaService),
    )

    // ---- Edge: START → planner ----
    .addEdge(START, 'planner')

    // ---- Edge: planner → [financial, news, competitive] (parallel) ----
    .addEdge('planner', 'financial')
    .addEdge('planner', 'news')
    .addEdge('planner', 'competitive')

    // ---- Edge: [financial, news, competitive] → thesis (fan-in) ----
    .addEdge('financial', 'thesis')
    .addEdge('news', 'thesis')
    .addEdge('competitive', 'thesis')

    // ---- Edge: thesis → report ----
    .addEdge('thesis', 'report')

    // ---- Edge: report → END ----
    .addEdge('report', END);

  return graph.compile();
}

/**
 * Execute the research graph for a given run.
 * This is called in the background (fire-and-forget) from the service layer.
 */
export async function executeResearchGraph(
  prismaService: PrismaService,
  runId: string,
  rawQuery: string,
  sseEmitter: Subject<SseEvent>,
): Promise<void> {
  const graph = buildResearchGraph(prismaService);

  const initialState: Partial<ResearchState> = {
    runId,
    rawQuery,
    sseEmitter,
    messages: [],
    company: null,
    evidence: [],
    financialOutput: null,
    newsOutput: null,
    competitiveOutput: null,
    thesisOutput: null,
    reportSections: [],
    confidenceScore: null,
    citations: [],
    reportId: null,
    errors: [],
  };

  try {
    // Update run status to 'planning'
    await prismaService.researchRun.update({
      where: { id: runId },
      data: { status: 'planning' },
    });

    await graph.invoke(initialState);

    console.log(`[ResearchGraph] Run ${runId} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ResearchGraph] Run ${runId} failed:`, message);

    // Ensure run is marked failed
    await prismaService.researchRun
      .update({
        where: { id: runId },
        data: { status: 'failed', errorMessage: message },
      })
      .catch(() => {});

    sseEmitter.next({
      event: 'error',
      data: { message: `Research pipeline failed: ${message}` },
    });
    sseEmitter.complete();
  }
}
