import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Logger,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ResearchService } from './research.service';
import { CreateResearchDto } from './dto/create-research.dto';

@Controller('research')
export class ResearchController {
  private readonly logger = new Logger(ResearchController.name);

  constructor(private readonly researchService: ResearchService) {}

  /**
   * POST /api/research
   * Initiate a new research run. Returns the runId immediately.
   * Client should then connect to GET /api/research/:id/stream for real-time updates.
   */
  @Post()
  async create(@Body() dto: CreateResearchDto) {
    this.logger.log(`New research query: "${dto.query}"`);
    return this.researchService.create(dto);
  }

  /**
   * GET /api/research/:id/stream
   * Server-Sent Events stream for real-time research progress and section delivery.
   * Connect with EventSource on the frontend.
   */
  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    this.logger.log(`SSE stream connected for run ${id}`);
    return this.researchService.streamRun(id);
  }

  /**
   * GET /api/research
   * List all research runs, ordered by most recent first.
   */
  @Get()
  async findAll() {
    return this.researchService.findAll();
  }

  /**
   * GET /api/research/:id
   * Get a specific research run by ID, including its report if completed.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.researchService.findOne(id);
  }
}
