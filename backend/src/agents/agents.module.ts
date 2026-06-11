import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * AgentsModule
 * Provides the LangGraph research graph and all agent services.
 * The actual graph execution is triggered from ResearchModule via executeResearchGraph().
 */
@Module({
  imports: [PrismaModule],
  exports: [],
})
export class AgentsModule {}
