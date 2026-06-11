# ResearchGPT

> AI-powered stock research agent that generates Wall-Street-grade equity research reports in under 90 seconds.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, Tailwind CSS, shadcn/ui |
| Backend | NestJS 11, TypeScript |
| Agent Framework | LangGraph |
| LLMs | Claude Opus, GPT-5.5 |
| Database | PostgreSQL 16 + pgvector |
| Search | Tavily, Exa |
| Financial Data | Financial Modeling Prep API |
| Observability | LangSmith |

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)
- API keys (see `.env.example`)

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd stock-research-agent
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# 3. Start the database
docker compose up -d

# 4. Run database migrations
npm run db:migrate

# 5. Start development servers
npm run dev:frontend   # http://localhost:3000
npm run dev:backend    # http://localhost:3001
```

## Project Structure

```
stock-research-agent/
├── frontend/          # Next.js 15 + Tailwind + shadcn/ui
├── backend/           # NestJS 11 + Prisma + LangGraph agents
├── docker-compose.yml # PostgreSQL + pgvector
└── .env.example       # Environment variable template
```

## Architecture

See [researchgpt_architecture.md](./researchgpt_architecture.md) for the full architecture specification.

## License

Private — Portfolio Project
