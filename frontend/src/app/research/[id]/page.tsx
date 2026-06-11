'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getResearchRun,
  getStreamUrl,
  ResearchRunDetail,
} from '@/lib/api';
import { PhaseProgress } from '@/components/research/PhaseProgress';
import { ReportSection, ReportSectionSkeleton } from '@/components/research/ReportSection';
import ConfidenceGauge from '@/components/research/ConfidenceGauge';

const EXPECTED_SECTIONS = [
  { id: 'executive_summary', title: 'Executive Summary', order: 1 },
  { id: 'business_overview', title: 'Business Overview', order: 2 },
  { id: 'financial_analysis', title: 'Financial Analysis', order: 3 },
  { id: 'news_analysis', title: 'Recent News Analysis', order: 4 },
  { id: 'competitive_analysis', title: 'Competitive Analysis', order: 5 },
  { id: 'bull_case', title: 'Bull Case', order: 6 },
  { id: 'bear_case', title: 'Bear Case', order: 7 },
  { id: 'investment_thesis', title: 'Investment Thesis', order: 8 },
  { id: 'confidence_score', title: 'Confidence Score & Data Quality', order: 9 },
  { id: 'citations', title: 'Source Citations', order: 10 },
];

export default function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params);
  const id = unwrappedParams.id;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<ResearchRunDetail | null>(null);
  
  // Accumulated sections
  const [sections, setSections] = useState<Record<string, {
    sectionId: string;
    title: string;
    content: string;
    order: number;
    hasDataGap?: boolean;
    isStreaming?: boolean;
  }>>({});
  
  // Active SSE streaming sectionId
  const [streamingSectionId, setStreamingSectionId] = useState<string | null>(null);
  
  const [currentPhase, setCurrentPhase] = useState<'pending' | 'planning' | 'researching' | 'synthesizing' | 'reporting' | 'completed' | 'failed'>('pending');
  const [currentMessage, setCurrentMessage] = useState('Initializing research environment...');
  const [error, setError] = useState<string | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [citations, setCitations] = useState<any[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial run data
  useEffect(() => {
    let active = true;

    const fetchRun = async () => {
      try {
        const data = await getResearchRun(id);
        if (!active) return;

        setRun(data);
        setCurrentPhase(data.status as any);

        if (data.status === 'completed' && data.report) {
          // Load existing sections
          const secMap: typeof sections = {};
          data.report.sections.forEach((s) => {
            secMap[s.sectionId] = {
              sectionId: s.sectionId,
              title: s.title,
              content: s.content,
              order: s.sectionOrder,
              hasDataGap: s.hasDataGap,
            };
          });
          setSections(secMap);
          setConfidenceScore(data.report.confidenceOverall);
          setCitations(data.report.citations);
          setLoading(false);
        } else if (data.status === 'failed') {
          setError('Research run failed to complete.');
          setLoading(false);
        } else {
          // Run is active (pending/planning/researching/synthesizing/reporting)
          // We load whatever completed sections are already saved in DB first
          const secMap: typeof sections = {};
          if (data.report && data.report.sections) {
            data.report.sections.forEach((s) => {
              secMap[s.sectionId] = {
                sectionId: s.sectionId,
                title: s.title,
                content: s.content,
                order: s.sectionOrder,
                hasDataGap: s.hasDataGap,
              };
            });
            setSections(secMap);
            setConfidenceScore(data.report.confidenceOverall);
            setCitations(data.report.citations);
          }
          setLoading(false);
          
          // Connect to the real-time stream
          connectStream();
        }
      } catch (err: any) {
        if (!active) return;
        console.error('Error fetching research run:', err);
        setError(err.message || 'Failed to load research report.');
        setCurrentPhase('failed');
        setLoading(false);
      }
    };

    fetchRun();

    return () => {
      active = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [id]);

  // Connect to NestJS SSE stream
  const connectStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`Connecting to SSE stream for run ${id}...`);
    const url = getStreamUrl(id);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Phase transitions
    eventSource.addEventListener('phase', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] Phase:', payload);
        if (payload.phase) {
          setCurrentPhase(payload.phase);
          if (payload.status === 'started') {
            setCurrentMessage(payload.message || `Starting ${payload.phase} phase...`);
          } else if (payload.status === 'complete') {
            setCurrentMessage(payload.message || `Completed ${payload.phase} phase.`);
          }
        }
      } catch (e) {
        console.error('Failed to parse phase event:', e);
      }
    });

    // Sub-agent progress messages
    eventSource.addEventListener('progress', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] Progress:', payload);
        if (payload.message) {
          setCurrentMessage(payload.message);
        }
      } catch (e) {
        console.error('Failed to parse progress event:', e);
      }
    });

    // Structured markdown sections as they complete
    eventSource.addEventListener('section', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] Section:', payload.sectionId);
        
        setSections((prev) => {
          // Clear streaming status on previous section
          const cleanPrev = { ...prev };
          Object.keys(cleanPrev).forEach((key) => {
            if (cleanPrev[key].isStreaming) {
              cleanPrev[key] = { ...cleanPrev[key], isStreaming: false };
            }
          });

          return {
            ...cleanPrev,
            [payload.sectionId]: {
              sectionId: payload.sectionId,
              title: payload.title || payload.sectionId,
              content: payload.content,
              order: payload.order,
              hasDataGap: payload.hasDataGap,
              isStreaming: true,
            },
          };
        });

        setStreamingSectionId(payload.sectionId);

        // Auto-scroll to newly generated section (optional, but premium UI touch!)
        setTimeout(() => {
          const el = document.getElementById(`section-${payload.sectionId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      } catch (e) {
        console.error('Failed to parse section event:', e);
      }
    });

    // Final completion event
    eventSource.addEventListener('complete', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] Complete:', payload);
        
        // Remove streaming markers
        setSections((prev) => {
          const cleanPrev = { ...prev };
          Object.keys(cleanPrev).forEach((key) => {
            cleanPrev[key] = { ...cleanPrev[key], isStreaming: false };
          });
          return cleanPrev;
        });

        setStreamingSectionId(null);
        setCurrentPhase('completed');
        setCurrentMessage('Research complete! Assembled final report.');
        setConfidenceScore(payload.confidenceScore);
        
        // Refresh full run details to get DB persisted citations & metadata
        getResearchRun(id).then((refreshed) => {
          setRun(refreshed);
          if (refreshed.report) {
            setCitations(refreshed.report.citations);
            if (refreshed.report.sections) {
              const secMap: typeof sections = {};
              refreshed.report.sections.forEach((s) => {
                secMap[s.sectionId] = {
                  sectionId: s.sectionId,
                  title: s.title,
                  content: s.content,
                  order: s.sectionOrder,
                  hasDataGap: s.hasDataGap,
                };
              });
              setSections(secMap);
            }
          }
        });

        eventSource.close();
      } catch (e) {
        console.error('Failed to parse complete event:', e);
      }
    });

    // Error event
    eventSource.addEventListener('error', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.error('[SSE] Custom Error:', payload);
        setError(payload.message || 'An error occurred during research execution.');
        setCurrentPhase('failed');
        eventSource.close();
      } catch (e) {
        // Fallback for standard EventSource error event (no payload)
        console.error('[SSE] Standard connection error');
        setError('Real-time connection lost.');
        setCurrentPhase('failed');
        eventSource.close();
      }
    });
  };

  const retryResearch = () => {
    setError(null);
    setCurrentPhase('planning');
    setSections({});
    setConfidenceScore(null);
    setCitations([]);
    connectStream();
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
        <p className="text-muted-foreground text-sm font-medium">Loading research report...</p>
      </div>
    );
  }

  // Active status color
  const getPhaseColor = () => {
    if (currentPhase === 'completed') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (currentPhase === 'failed') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-primary/10 text-primary border-primary/20 animate-pulse';
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
      {/* Ambient background decoration */}
      <div className="fixed inset-0 -z-20 tech-grid pointer-events-none" />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full bg-primary/5 blur-[140px] animate-slow-pulse" />
      </div>

      {/* Left/Main Column: Report Content (3 cols on large screens) */}
      <div className="lg:col-span-3 space-y-8 print:col-span-4">
        {/* Header card */}
        <div className="rounded-2xl border border-white/10 glass-panel p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 blur-[90px] -z-10" />

          {/* Nav & Action row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors group"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transform group-hover:-translate-x-0.5 transition-transform"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Research Terminal
            </Link>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border uppercase ${getPhaseColor()}`}>
                {currentPhase === 'researching' ? 'Analyzing' : currentPhase}
              </span>

              {currentPhase === 'completed' && (
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect width="12" height="8" x="6" y="14" rx="1" />
                  </svg>
                  Export PDF
                </button>
              )}
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gradient">
              {run?.companyName ? `${run.companyName} Equity Research` : 'Equity Research Report'}
            </h1>

            {/* Financial Terminal Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] font-mono text-xs shadow-inner">
              <div className="space-y-1">
                <span className="text-muted-foreground/50 block text-[9px] uppercase tracking-wider font-semibold">Ticker Symbol</span>
                <span className="font-extrabold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-[11px] inline-block tracking-wider">
                  {run?.ticker || 'N/A'}
                </span>
              </div>
              <div className="space-y-1 border-l border-white/[0.06] pl-4">
                <span className="text-muted-foreground/50 block text-[9px] uppercase tracking-wider font-semibold">Exchange</span>
                <span className="font-bold text-foreground/90">{run?.exchange || 'N/A'}</span>
              </div>
              <div className="space-y-1 border-l border-white/[0.06] pl-4">
                <span className="text-muted-foreground/50 block text-[9px] uppercase tracking-wider font-semibold">Sector</span>
                <span className="font-bold text-foreground/90 truncate block max-w-full" title={run?.sector || undefined}>
                  {run?.sector || 'N/A'}
                </span>
              </div>
              <div className="space-y-1 border-l border-white/[0.06] pl-4">
                <span className="text-muted-foreground/50 block text-[9px] uppercase tracking-wider font-semibold">Industry</span>
                <span className="font-bold text-foreground/90 truncate block max-w-full" title={run?.industry || undefined}>
                  {run?.industry || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Original Query */}
          <div className="text-sm p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] shadow-inner relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <span className="text-[10px] text-primary uppercase font-extrabold block mb-1.5 tracking-widest">
              Research Objective
            </span>
            <p className="text-foreground/90 italic font-mono text-xs">"{run?.rawQuery}"</p>
          </div>

          {/* Real-time progress tracker */}
          {currentPhase !== 'completed' && currentPhase !== 'failed' && (
            <div className="pt-4 border-t border-white/[0.08]">
              <PhaseProgress currentPhase={currentPhase} currentMessage={currentMessage} />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 space-y-3 shadow-md">
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                <span>⚠️ Pipeline Error Detected</span>
              </div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <button
                onClick={retryResearch}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-bold text-xs hover:bg-destructive/90 transition-all cursor-pointer active:scale-95 shadow-md"
              >
                Re-initialize Pipeline
              </button>
            </div>
          )}
        </div>

        {/* Report Sections List */}
        <div className="space-y-8">
          {EXPECTED_SECTIONS.map((sec) => {
            const activeSection = sections[sec.id];
            
            // Skip confidence score and citations from streaming sections since we render them statically in sidebar
            if ((sec.id === 'confidence_score' || sec.id === 'citations') && !activeSection) {
              return null;
            }

            if (activeSection) {
              return (
                <ReportSection
                  key={sec.id}
                  sectionId={activeSection.sectionId}
                  title={activeSection.title}
                  content={activeSection.content}
                  order={activeSection.order}
                  hasDataGap={activeSection.hasDataGap}
                  isStreaming={activeSection.isStreaming}
                />
              );
            } else {
              // Only render skeleton if pipeline is active and we haven't reached completed/failed
              const isWorking = currentPhase !== 'completed' && currentPhase !== 'failed';
              if (isWorking) {
                return (
                  <ReportSectionSkeleton
                    key={sec.id}
                    order={sec.order}
                    label={sec.title}
                  />
                );
              }
              return null;
            }
          })}
        </div>
      </div>

      {/* Right Column: Key metrics & Navigator (1 col) */}
      <div className="space-y-8 print:hidden lg:sticky lg:top-6 lg:self-start">
        {/* Confidence Gauge Widget */}
        {confidenceScore !== null && (
          <div className="rounded-2xl border border-white/10 glass-panel p-6 flex flex-col items-center text-center space-y-4 shadow-xl">
            <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-widest">
              Data Confidence Index
            </h3>
            <ConfidenceGauge score={confidenceScore} size={130} strokeWidth={11} />
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              Composite score mapping financial depth, news relevance, competitive data, and citation density.
            </p>
          </div>
        )}

        {/* Navigation Sidebar */}
        <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-4 shadow-xl">
          <h3 className="font-bold text-xs text-muted-foreground uppercase tracking-widest border-b border-white/[0.08] pb-2">
            Report Navigator
          </h3>
          <nav className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
            {EXPECTED_SECTIONS.map((sec) => {
              const active = !!sections[sec.id];
              const isCurrent = streamingSectionId === sec.id;
              
              return (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  disabled={!active}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg text-xs font-semibold
                    transition-all duration-200 flex items-center justify-between
                    ${active ? 'hover:bg-primary/5 hover:text-primary text-foreground/85 cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'}
                    ${isCurrent ? 'bg-primary/10 text-primary border-l-2 border-primary font-bold' : ''}
                  `}
                >
                  <span className="truncate">{sec.title}</span>
                  {active && !isCurrent && (
                    <span className="text-[10px] text-emerald-500 font-extrabold">✓</span>
                  )}
                  {isCurrent && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sources/Citations Quick View */}
        {citations.length > 0 && (
          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-xs text-muted-foreground uppercase tracking-widest border-b border-white/[0.08] pb-2">
              Primary Sources ({citations.length})
            </h3>
            <div className="flex flex-col gap-3.5 max-h-[250px] overflow-y-auto pr-1">
              {citations.slice(0, 8).map((cite) => (
                <a
                  key={cite.displayId}
                  href={cite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs group hover:bg-primary/5 p-2.5 rounded-lg border border-white/[0.04] hover:border-primary/20 transition-all flex items-start gap-2.5"
                >
                  <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold select-none shrink-0 group-hover:bg-primary/20 transition-colors">
                    {cite.displayId}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-bold text-foreground/80 truncate group-hover:text-primary transition-colors">
                      {cite.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{cite.sourceName}</p>
                  </div>
                </a>
              ))}
              {citations.length > 8 && (
                <button
                  onClick={() => scrollToSection('citations')}
                  className="text-xs text-primary font-bold hover:underline text-center pt-2 w-full transition-all cursor-pointer"
                >
                  View all {citations.length} sources
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
