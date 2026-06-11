import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateResearchDto } from './dto/create-research.dto';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { executeResearchGraph } from '../../agents/research.graph';
import { SseEvent } from '../../agents/types/agent-types';
import { MessageEvent } from '@nestjs/common';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  // Per-run SSE emitter subjects — keyed by runId
  private readonly sseSubjects = new Map<string, Subject<SseEvent>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new research run record and fire off the LangGraph pipeline.
   * Returns the runId immediately — the client then connects to the SSE stream.
   */
  async create(dto: CreateResearchDto) {
    const run = await this.prisma.researchRun.create({
      data: {
        rawQuery: dto.query,
        ticker: dto.ticker || 'PENDING',
        companyName: dto.companyName || 'Pending Resolution',
        status: 'pending',
        focusAreas: dto.focusAreas || [],
      },
    });

    this.logger.log(`Created research run ${run.id} for query: "${dto.query}"`);

    // Create the SSE subject for this run
    const subject = new Subject<SseEvent>();
    this.sseSubjects.set(run.id, subject);

    // Fire off the pipeline in the background (non-blocking)
    this.runPipelineInBackground(run.id, dto.query, subject);

    return {
      id: run.id,
      query: run.rawQuery,
      ticker: run.ticker,
      status: run.status,
      createdAt: run.createdAt,
    };
  }

  /**
   * Get the SSE Observable for a given run.
   * Returns an Observable that emits MessageEvent objects for NestJS @Sse.
   */
  streamRun(runId: string): Observable<MessageEvent> {
    let subject = this.sseSubjects.get(runId);

    if (!subject) {
      // Run exists but subject already cleaned up — create a terminal subject
      const terminal = new Subject<SseEvent>();
      setTimeout(() => {
        terminal.next({
          event: 'error',
          data: { message: 'Research run stream expired or not found. Please refresh.' },
        });
        terminal.complete();
      }, 100);
      subject = terminal;
    }

    return subject.pipe(
      map((event: SseEvent) => ({
        type: event.event,
        data: JSON.stringify(event.data),
      })),
    );
  }

  /**
   * List all research runs, most recent first.
   */
  async findAll() {
    const runs = await this.prisma.researchRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        rawQuery: true,
        ticker: true,
        companyName: true,
        status: true,
        totalDurationMs: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return { runs, total: runs.length };
  }

  /**
   * Get a single research run by ID with its report (if completed).
   */
  async findOne(id: string) {
    const run = await this.prisma.researchRun.findUnique({
      where: { id },
      include: {
        report: {
          include: {
            sections: {
              orderBy: { sectionOrder: 'asc' },
            },
            citations: {
              orderBy: { displayId: 'asc' },
            },
          },
        },
        tasks: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Research run ${id} not found`);
    }

    return run;
  }

  /**
   * Executes the research graph pipeline in the background.
   * Errors are handled within the graph itself (which emits error SSE events).
   */
  private runPipelineInBackground(
    runId: string,
    rawQuery: string,
    subject: Subject<SseEvent>,
  ): void {
    // Note the subject cleanup happens when the subject completes
    subject.subscribe({
      complete: () => {
        this.sseSubjects.delete(runId);
        this.logger.log(`SSE stream complete for run ${runId}`);
      },
      error: () => {
        this.sseSubjects.delete(runId);
      },
    });

    // Execute graph asynchronously
    executeResearchGraph(this.prisma, runId, rawQuery, subject).catch((err) => {
      this.logger.error(`Pipeline error for run ${runId}:`, err);
    });
  }
}
