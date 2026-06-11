'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createResearch, getResearchHistory, ResearchRun } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ResearchRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load research history
  useEffect(() => {
    getResearchHistory()
      .then((data) => {
        setHistory(data.runs || []);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error('Failed to load research history:', err);
        setLoadingHistory(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await createResearch(query);
      router.push(`/research/${result.id}`);
    } catch (err: any) {
      console.error('Failed to start research:', err);
      setError(err.message || 'Failed to start research pipeline.');
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-start px-4 py-16 md:py-24 max-w-6xl mx-auto w-full space-y-16 relative z-10">
      {/* Ambient decorative elements */}
      <div className="fixed inset-0 -z-20 tech-grid pointer-events-none" />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/10 blur-[130px] animate-slow-pulse" />
        <div className="absolute top-1/3 -left-1/4 w-[350px] h-[350px] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 w-[350px] h-[350px] rounded-full bg-emerald-500/5 blur-[120px]" />
      </div>

      {/* Hero */}
      <div className="text-center space-y-8 max-w-3xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-md text-xs font-semibold text-primary tracking-wide">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          AI-POWERED EQUITY INTELLIGENCE
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-none text-gradient-neon pb-1">
          Research any stock
          <br className="hidden sm:inline" />
          <span className="text-foreground"> in 90 seconds</span>
        </h1>

        {/* Subheading */}
        <p className="text-sm sm:text-base text-muted-foreground/80 max-w-xl mx-auto leading-relaxed">
          Wall-Street-grade equity research reports with deep financial tables,
          news sentiment, competitive intelligence, and citation-backed
          investment theses.
        </p>

        {/* Search input form */}
        <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto pt-4">
          <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-2xl focus-within:border-primary/50 focus-within:shadow-[0_0_25px_oklch(0.64_0.195_268/20%)] transition-all duration-300">
            <div className="pl-3 text-muted-foreground">
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              )}
            </div>
            <input
              id="research-query-input"
              type="text"
              placeholder='Try "Research NVIDIA" or "Analyze Apple"'
              className="flex-1 bg-transparent text-sm md:text-base outline-none placeholder:text-muted-foreground/45 text-foreground py-1.5"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              required
            />
            <Button 
              type="submit" 
              size="default" 
              className="px-6 font-bold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-[0_4px_12px_oklch(0.64_0.195_268/30%)] active:scale-95 disabled:scale-100" 
              disabled={loading}
            >
              {loading ? 'Analyzing...' : 'Research'}
            </Button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400 text-left flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
          
          <p className="mt-3 text-[11px] text-muted-foreground/50 font-medium">
            ⚡ Enter a company name or ticker to spin up the multi-agent pipeline.
          </p>
        </form>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl">
        {[
          { text: "Financial Analysis", icon: "📊" },
          { text: "News Sentiment", icon: "📰" },
          { text: "Competitive Intel", icon: "⚔️" },
          { text: "Bull & Bear Cases", icon: "📈" },
          { text: "Confidence Score", icon: "🎯" },
          { text: "Source Citations", icon: "📎" },
        ].map((feature) => (
          <span
            key={feature.text}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all text-xs font-semibold text-muted-foreground/90 shadow-sm"
          >
            <span>{feature.icon}</span>
            <span>{feature.text}</span>
          </span>
        ))}
      </div>

      {/* History section */}
      <div className="w-full space-y-6 pt-6">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-1 h-3.5 bg-primary rounded-full" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Research History & Vault
            </h2>
          </div>
          <span className="text-[10px] text-muted-foreground/50 font-mono bg-white/[0.03] px-2.5 py-1 rounded border border-white/[0.05] tracking-wider">
            {history.length} REPORT{history.length !== 1 ? 'S' : ''} SECURED
          </span>
        </div>

        {loadingHistory ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-12 text-center">
            <p className="text-sm text-muted-foreground/60">No reports generated yet. Start your first research query above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {history.map((run) => (
              <div
                key={run.id}
                onClick={() => router.push(`/research/${run.id}`)}
                className="group relative rounded-xl glass-panel glass-panel-interactive p-5 cursor-pointer flex flex-col justify-between h-40 overflow-hidden"
              >
                {/* Glow bar at the top */}
                <div className={`absolute top-0 inset-x-0 h-[2px] transition-opacity duration-300 opacity-60 group-hover:opacity-100 ${
                  run.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : run.status === 'failed' ? 'bg-gradient-to-r from-red-500 to-orange-400' : 'bg-gradient-to-r from-primary to-violet-500'
                }`} />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded text-[10px] font-mono font-bold text-foreground tracking-wider group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:text-primary transition-all">
                      {run.ticker}
                    </span>
                    
                    <span className={`inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest ${
                      run.status === 'completed' ? 'text-emerald-400' : run.status === 'failed' ? 'text-red-400' : 'text-primary'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${
                        run.status === 'completed' ? 'bg-emerald-400 animate-pulse' : run.status === 'failed' ? 'bg-red-400' : 'bg-primary animate-ping'
                      }`} />
                      {run.status}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-sm text-foreground/90 truncate pt-1 group-hover:text-foreground transition-colors">
                    {run.companyName || 'Pending Resolution'}
                  </h3>
                  
                  <p className="text-xs text-muted-foreground/60 line-clamp-2 italic font-mono pt-0.5">
                    "{run.rawQuery}"
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-[10px] text-muted-foreground/40 font-mono">
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                    {new Date(run.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {run.totalDurationMs ? (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {(run.totalDurationMs / 1000).toFixed(0)}s
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="w-full pt-8 text-center text-[10px] tracking-wider font-mono text-muted-foreground/20 border-t border-white/[0.05]">
        RESEARCHGPT — AI-POWERED FINANCIAL INTELLIGENCE TERMINAL
      </footer>
    </main>
  );
}
