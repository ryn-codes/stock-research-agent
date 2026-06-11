/**
 * ResearchGPT — Multi-Agent Pipeline Test Script
 * Programmatically runs the complete multi-agent pipeline step-by-step
 * to verify API keys, LLM connections, search tools, and DB persistence.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

process.env.MOCK_LLM = 'false';

// If MOCK_LLM is enabled, override LangChain Gemini invoke method
if (process.env.MOCK_LLM === 'true') {
  console.log('⚠️ MOCK LLM MODE ENABLED: Overriding Gemini responses for the test.');
  
  ChatGoogleGenerativeAI.prototype.invoke = async function (messages: any) {
    const promptText = JSON.stringify(messages);
    
    if (promptText.includes('corrected company name') || promptText.includes('corrected')) {
      return {
        content: 'Reliance Industries',
        usage_metadata: { input_tokens: 5, output_tokens: 5 }
      } as any;
    }
    
    if (promptText.includes('Planner Agent') || promptText.includes('Planner')) {
      return {
        content: JSON.stringify({
          ticker: 'RELIANCE',
          companyName: 'Reliance Industries',
          exchange: 'NSE+BSE',
          confidence: 0.95,
          reasoning: 'User asked to research Reliance'
        }),
        usage_metadata: { input_tokens: 10, output_tokens: 20 }
      } as any;
    }
    
    if (promptText.includes('Financial Agent') || promptText.includes('Financial')) {
      return {
        content: '## Financial Analysis\n\nReliance has shown strong revenue growth...',
        usage_metadata: { input_tokens: 15, output_tokens: 30 }
      } as any;
    }

    if (promptText.includes('News Agent') || promptText.includes('Recent News')) {
      return {
        content: JSON.stringify({
          overallSentiment: {
            score: 0.8,
            label: 'positive',
            distribution: { positive: 80, neutral: 15, negative: 5 }
          },
          materialEvents: [
            {
              type: 'earnings',
              headline: 'Reliance reports record quarterly revenue',
              date: '2026-05-20',
              impact: 'positive',
              significance: 'high',
              sourceUrl: 'https://reliance.com'
            }
          ],
          sectionMarkdown: '## Recent News Analysis\n\nReliance sentiment remains extremely positive...'
        }),
        usage_metadata: { input_tokens: 20, output_tokens: 40 }
      } as any;
    }

    if (promptText.includes('Competitive Agent') || promptText.includes('Moat')) {
      return {
        content: JSON.stringify({
          competitors: [
            { ticker: 'IOC', companyName: 'Indian Oil Corporation', marketCap: 150000, description: 'Oil', overlapAreas: ['Refining'] }
          ],
          moatAssessment: {
            type: 'wide',
            sources: ['scale', 'cost_advantage'],
            durability: 'high',
            rationale: 'Reliance has a wide moat due to scale.'
          },
          sectionMarkdown: '## Competitive Analysis\n\nReliance dominates the Indian oil & telecom markets...'
        }),
        usage_metadata: { input_tokens: 25, output_tokens: 50 }
      } as any;
    }

    if (promptText.includes('Thesis Agent') || promptText.includes('Bull Case')) {
      return {
        content: `## Bull Case\n\n- Retail scale\n- Telecom dominance\n\n---\n\n## Bear Case\n\n- Refining margins pressure\n- Debt levels\n\n---\n\n## Investment Thesis\n\nStrong buy recommendation...`,
        usage_metadata: { input_tokens: 30, output_tokens: 60 }
      } as any;
    }

    if (promptText.includes('Report Agent') || promptText.includes('Executive Summary')) {
      return {
        content: JSON.stringify({
          executiveSummary: '## Executive Summary\n\nReliance is a strong buy...',
          businessOverview: '## Business Overview\n\nReliance is the leader in energy and retail...'
        }),
        usage_metadata: { input_tokens: 35, output_tokens: 70 }
      } as any;
    }

    return {
      content: 'Mocked Gemini response',
      usage_metadata: { input_tokens: 5, output_tokens: 5 }
    } as any;
  };
}

import { plannerNode } from './src/agents/nodes/planner.node';
import { financialNode } from './src/agents/nodes/financial.node';
import { newsNode } from './src/agents/nodes/news.node';
import { competitiveNode } from './src/agents/nodes/competitive.node';
import { thesisNode } from './src/agents/nodes/thesis.node';
import { reportNode } from './src/agents/nodes/report.node';
import { ResearchState } from './src/agents/state/research-state';
import { PrismaService } from './src/prisma/prisma.service';
import { Subject } from 'rxjs';

async function runTest() {
  console.log('============================================================');
  console.log('ResearchGPT Agent Pipeline Integration Test');
  console.log('============================================================');

  // Verify environment keys
  console.log('Checking API keys...');
  const gcpKey = process.env.GCP_API_KEY;
  const indianApiKey = process.env.INDIAN_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  console.log(`- Gemini (GCP_API_KEY): ${gcpKey ? 'Configured ✅' : 'MISSING ❌'}`);
  console.log(`- IndianAPI (INDIAN_API_KEY): ${indianApiKey ? 'Configured ✅' : 'MISSING ❌'}`);
  console.log(`- Tavily (TAVILY_API_KEY): ${tavilyKey ? 'Configured ✅' : 'MISSING ❌'}`);
  console.log(`- Exa (EXA_API_KEY): ${exaKey ? 'Configured ✅' : 'MISSING ❌'}`);

  if (!gcpKey || !indianApiKey || !tavilyKey) {
    console.error('CRITICAL ERROR: Missing required API keys. Exiting test.');
    process.exit(1);
  }

  // Initialize prisma
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    console.log('Database Connection: Connected ✅');
  } catch (dbErr) {
    console.error('Database Connection: FAILED ❌', dbErr);
    process.exit(1);
  }

  // Create a mock run record in database so Report agent can persist
  const mockRun = await prisma.researchRun.create({
    data: {
      rawQuery: 'Research Tips Music Ltd',
      ticker: 'TIPSMUSIC',
      companyName: 'Tips Music Ltd',
      status: 'testing',
      focusAreas: [],
    },
  });
  console.log(`Created test run in DB: ID = ${mockRun.id} ✅`);

  // Setup initial state
  const mockSse = new Subject<any>();
  mockSse.subscribe({
    next: (evt) => {
      console.log(`   [SSE Event] [${evt.event}]`, JSON.stringify(evt.data).slice(0, 120) + (JSON.stringify(evt.data).length > 120 ? '...' : ''));
    },
  });

  const state: ResearchState = {
    runId: mockRun.id,
    rawQuery: 'Research Tips Music Ltd',
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
    messages: [],
    sseEmitter: mockSse,
  };

  try {
    // ------------------------------------------------------------
    // STEP 1: Planner Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 1: Running PLANNER AGENT ---');
    const plannerResult = await plannerNode(state);
    if (plannerResult.errors && plannerResult.errors.length > 0) {
      console.error('Planner Agent failed:', plannerResult.errors);
      throw new Error('Planner failed');
    }
    state.company = plannerResult.company!;
    state.errors = [...(state.errors || []), ...(plannerResult.errors || [])];
    console.log(`Planner Agent output:
- Resolved Ticker: ${state.company.ticker}
- Resolved Company: ${state.company.companyName}
- Exchange: ${state.company.exchange}
- Sector: ${state.company.sector}
- Status: SUCCESS ✅`);

    // ------------------------------------------------------------
    // STEP 2: Financial Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 2: Running FINANCIAL AGENT ---');
    const financialResult = await financialNode(state);
    if (financialResult.errors && financialResult.errors.length > 0) {
      console.error('Financial Agent failed:', financialResult.errors);
      throw new Error('Financial failed');
    }
    state.financialOutput = financialResult.financialOutput!;
    state.evidence = [...state.evidence, ...(financialResult.evidence || [])];
    console.log(`Financial Agent output:
- Ticker: ${state.company.ticker}
- Price: ₹${state.financialOutput.financialSummary.currentPrice}
- Market Cap: ${state.financialOutput.financialSummary.marketCap} Cr
- YoY Growth: ${state.financialOutput.derivedMetrics.revenueGrowthYoY?.toFixed(2)}%
- Sections Length: ${state.financialOutput.sectionMarkdown.length} chars
- Data Gaps: ${state.financialOutput.hasDataGap ? 'Yes ⚠️' : 'No ✅'}
- Status: SUCCESS ✅`);

    // ------------------------------------------------------------
    // STEP 3: News Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 3: Running NEWS AGENT ---');
    const newsResult = await newsNode(state);
    if (newsResult.errors && newsResult.errors.length > 0) {
      console.error('News Agent failed:', newsResult.errors);
      throw new Error('News failed');
    }
    state.newsOutput = newsResult.newsOutput!;
    state.evidence = [...state.evidence, ...(newsResult.evidence || [])];
    console.log(`News Agent output:
- Articles Found: ${state.newsOutput.articles.length}
- Sentiment Score: ${state.newsOutput.overallSentiment.score} (${state.newsOutput.overallSentiment.label})
- Material Events: ${state.newsOutput.materialEvents.length}
- Sections Length: ${state.newsOutput.sectionMarkdown.length} chars
- Status: SUCCESS ✅`);

    // ------------------------------------------------------------
    // STEP 4: Competitive Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 4: Running COMPETITIVE AGENT ---');
    const competitiveResult = await competitiveNode(state);
    if (competitiveResult.errors && competitiveResult.errors.length > 0) {
      console.error('Competitive Agent failed:', competitiveResult.errors);
      throw new Error('Competitive failed');
    }
    state.competitiveOutput = competitiveResult.competitiveOutput!;
    state.evidence = [...state.evidence, ...(competitiveResult.evidence || [])];
    console.log(`Competitive Agent output:
- Peers Found: ${state.competitiveOutput.competitors.map((c) => c.ticker).join(', ')}
- Moat Classification: ${state.competitiveOutput.moatAssessment.type.toUpperCase()}
- Sections Length: ${state.competitiveOutput.sectionMarkdown.length} chars
- Status: SUCCESS ✅`);

    // ------------------------------------------------------------
    // STEP 5: Thesis Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 5: Running THESIS AGENT ---');
    const thesisResult = await thesisNode(state);
    if (thesisResult.errors && thesisResult.errors.length > 0) {
      console.error('Thesis Agent failed:', thesisResult.errors);
      throw new Error('Thesis failed');
    }
    state.thesisOutput = thesisResult.thesisOutput!;
    console.log(`Thesis Agent output:
- Recommendation: ${state.thesisOutput.investmentThesis.recommendation.toUpperCase()}
- Bull Case Catalysts: ${state.thesisOutput.bullCase.catalysts.length}
- Bear Case Risks: ${state.thesisOutput.bearCase.risks.length}
- Status: SUCCESS ✅`);

    // ------------------------------------------------------------
    // STEP 6: Report Agent
    // ------------------------------------------------------------
    console.log('\n--- Step 6: Running REPORT AGENT ---');
    const reportResult = await reportNode(state, prisma);
    if (reportResult.errors && reportResult.errors.length > 0) {
      console.error('Report Agent failed:', reportResult.errors);
      throw new Error('Report failed');
    }
    console.log(`Report Agent output:
- Confidence Score: ${reportResult.confidenceScore?.overall}/100
- Assembled Sections: ${reportResult.reportSections?.length}
- Total Citations: ${reportResult.citations?.length}
- Saved Report ID: ${reportResult.reportId}
- Status: SUCCESS ✅`);

    console.log('\n--- CITATIONS SUMMARY ---');
    reportResult.citations?.forEach((c) => {
      console.log(`${c.displayId} ${c.title} (${c.url})`);
    });

    console.log('\n============================================================');
    console.log('Pipeline Integration Test Completed Successfully 🎉');
    console.log('============================================================');
  } catch (err) {
    console.error('\n❌ Test aborted due to error:', err);
  } finally {
    // Clean up test database run
    console.log('\nCleaning up test run database record...');
    await prisma.researchRun.deleteMany({
      where: { id: mockRun.id },
    }).catch((e) => console.error('Failed to cleanup run:', e));
    
    await prisma.$disconnect();
    console.log('Disconnected from database. Test process complete.');
    process.exit(0);
  }
}

runTest();
