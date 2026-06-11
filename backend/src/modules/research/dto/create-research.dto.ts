import { IsString, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for creating a new research run.
 * Maps to the query intake phase from the architecture spec (Section 6).
 */
export class CreateResearchDto {
  /**
   * Natural language research query.
   * @example "Research NVIDIA"
   * @example "Research Apple focusing on AI strategy"
   */
  @IsString()
  @MinLength(2, { message: 'Query must be at least 2 characters' })
  @MaxLength(500, { message: 'Query must not exceed 500 characters' })
  query: string;

  /**
   * Optional pre-resolved ticker symbol.
   * If not provided, the Planner Agent will resolve it.
   */
  @IsOptional()
  @IsString()
  ticker?: string;

  /**
   * Optional pre-resolved company name.
   */
  @IsOptional()
  @IsString()
  companyName?: string;

  /**
   * Optional focus areas for the research.
   * @example ["AI revenue", "data center growth"]
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[];
}
