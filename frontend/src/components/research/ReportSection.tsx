'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReportSectionProps {
  sectionId: string;
  title: string;
  content: string;
  order: number;
  hasDataGap?: boolean;
  isStreaming?: boolean;
}

const SECTION_ICONS: Record<string, string> = {
  executive_summary: '📋',
  business_overview: '🏢',
  financial_analysis: '📊',
  news_analysis: '📰',
  competitive_analysis: '⚔️',
  bull_case: '🐂',
  bear_case: '🐻',
  investment_thesis: '🎯',
  confidence_score: '🎲',
  citations: '📎',
};

const SECTION_COLORS: Record<string, string> = {
  executive_summary: 'border-l-primary bg-primary/[0.01]',
  business_overview: 'border-l-blue-500 bg-blue-500/[0.01]',
  financial_analysis: 'border-l-emerald-500 bg-emerald-500/[0.01]',
  news_analysis: 'border-l-amber-500 bg-amber-500/[0.01]',
  competitive_analysis: 'border-l-purple-500 bg-purple-500/[0.01]',
  bull_case: 'border-l-green-500 bg-green-500/[0.01]',
  bear_case: 'border-l-red-500 bg-red-500/[0.01]',
  investment_thesis: 'border-l-cyan-500 bg-cyan-500/[0.01]',
  confidence_score: 'border-l-orange-500 bg-orange-500/[0.01]',
  citations: 'border-l-slate-500 bg-slate-500/[0.01]',
};

export function ReportSection({
  sectionId,
  title,
  content,
  order,
  hasDataGap = false,
  isStreaming = false,
}: ReportSectionProps) {
  const icon = SECTION_ICONS[sectionId] ?? '📄';
  const colorClass = SECTION_COLORS[sectionId] ?? 'border-l-primary bg-primary/[0.01]';

  return (
    <div
      id={`section-${sectionId}`}
      className={`
        rounded-xl border-y border-r border-white/10 border-l-[3px] ${colorClass} glass-panel overflow-hidden
        transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 shadow-xl hover:border-r-white/20 hover:border-y-white/20 duration-300
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <span className="text-lg bg-white/[0.04] p-1.5 rounded-lg border border-white/[0.06] shadow-sm">{icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 font-mono tracking-wider font-semibold">
                SECTION {order.toString().padStart(2, '0')}
              </span>
              <h3 className="font-bold text-sm tracking-wide text-foreground/90">{title}</h3>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasDataGap && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 tracking-wider">
              ⚠️ DATA GAP
            </span>
          )}
          {isStreaming && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5 text-sm text-muted-foreground/80 max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => (
              <h2 className="text-base font-extrabold text-foreground mt-8 mb-4 border-b border-white/[0.08] pb-2 flex items-center gap-2 font-mono uppercase tracking-widest text-primary">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-bold text-foreground/90 mt-5 mb-2.5">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-xs font-bold text-foreground/70 mt-4 mb-2 uppercase tracking-wider font-mono">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="leading-relaxed mb-4 text-muted-foreground/85 text-xs sm:text-sm">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-extrabold text-foreground">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-2 mb-4 text-muted-foreground/85 text-xs sm:text-sm pl-2">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-2 mb-4 text-muted-foreground/85 text-xs sm:text-sm pl-2">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-muted-foreground/85 leading-relaxed">
                {children}
              </li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-3 border-amber-500/80 bg-amber-500/5 px-4 py-3 rounded-r-lg my-5 italic text-muted-foreground/75 text-xs font-mono">
                {children}
              </blockquote>
            ),
            a: ({ href, children }) => {
              const textContent = React.Children.toArray(children).join('');
              const isCitation = /^\[?\d+\]?$/.test(textContent.trim());

              if (isCitation) {
                const number = textContent.replace(/[\[\]]/g, '');
                return (
                  <sup className="ml-0.5 select-none inline-block">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-1.5 py-0.5 text-[8px] font-extrabold font-mono bg-primary/10 border border-primary/20 hover:border-primary/50 text-primary hover:bg-primary/20 rounded shadow-sm transition-all duration-200 cursor-pointer hover:-translate-y-0.5 leading-none"
                      style={{ verticalAlign: 'baseline' }}
                    >
                      {number}
                    </a>
                  </sup>
                );
              }

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline hover:text-primary/80 transition-colors font-bold inline-flex items-center gap-0.5"
                >
                  {children}
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 inline"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                </a>
              );
            },
            table: ({ children }) => (
              <div className="overflow-x-auto my-6 rounded-xl border border-white/[0.08] bg-slate-950/40 shadow-inner">
                <table className="w-full text-[11px] border-collapse text-left font-mono">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-white/[0.03] border-b border-white/[0.08] font-bold text-foreground/90 tracking-wider uppercase text-[10px]">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/[0.04]">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-white/[0.01] transition-colors duration-150">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-3 font-semibold text-muted-foreground/80 tracking-wider">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-3 text-foreground/95 font-medium">
                {children}
              </td>
            ),
            code: ({ children }) => (
              <code className="text-xs bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono text-primary font-bold">
                {children}
              </code>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Skeleton loading placeholder for a section that hasn't loaded yet */
export function ReportSectionSkeleton({ order, label }: { order: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 glass-panel overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="h-6 w-6 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/30 font-mono font-semibold tracking-wider">
            SECTION {order.toString().padStart(2, '0')}
          </span>
          <div className="h-4 w-32 rounded bg-white/[0.04] animate-pulse" />
        </div>
      </div>
      <div className="px-5 py-5 space-y-2.5">
        <div className="h-3 rounded bg-white/[0.03] animate-pulse w-full" />
        <div className="h-3 rounded bg-white/[0.03] animate-pulse w-4/5" />
        <div className="h-3 rounded bg-white/[0.03] animate-pulse w-3/4" />
        <div className="h-3 rounded bg-white/[0.03] animate-pulse w-full" />
        <div className="h-3 rounded bg-white/[0.03] animate-pulse w-2/3" />
      </div>
    </div>
  );
}
