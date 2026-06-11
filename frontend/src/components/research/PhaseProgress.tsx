'use client';

import React from 'react';

type Phase = 'pending' | 'planning' | 'researching' | 'synthesizing' | 'reporting' | 'completed' | 'failed';

interface PhaseProgressProps {
  currentPhase: Phase;
  currentMessage?: string;
}

const PHASES: Array<{ key: Phase; label: string; icon: React.ReactNode }> = [
  { 
    key: 'planning', 
    label: 'Planning', 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2Z"/>
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2Z"/>
      </svg>
    ) 
  },
  { 
    key: 'researching', 
    label: 'Researching', 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
      </svg>
    ) 
  },
  { 
    key: 'synthesizing', 
    label: 'Synthesizing', 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12"/>
        <path d="M8 3v4"/>
        <path d="M16 3v4"/>
        <path d="M8 7H6.3a2 2 0 0 0-1.8 2.8l5.2 9.5a2 2 0 0 0 3.6 0l5.2-9.5A2 2 0 0 0 17.7 7H16"/>
      </svg>
    ) 
  },
  { 
    key: 'reporting', 
    label: 'Reporting', 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
        <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
        <path d="M10 9H8"/>
        <path d="M16 13H8"/>
        <path d="M16 17H8"/>
      </svg>
    ) 
  },
  { 
    key: 'completed', 
    label: 'Complete', 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    ) 
  },
];

const PHASE_ORDER: Record<Phase, number> = {
  pending: 0,
  planning: 1,
  researching: 2,
  synthesizing: 3,
  reporting: 4,
  completed: 5,
  failed: -1,
};

export function PhaseProgress({ currentPhase, currentMessage }: PhaseProgressProps) {
  const currentOrder = PHASE_ORDER[currentPhase] ?? 0;

  return (
    <div className="w-full space-y-6">
      {/* Phase steps */}
      <div className="flex items-center justify-between">
        {PHASES.map((phase, index) => {
          const phaseOrder = PHASE_ORDER[phase.key] ?? 0;
          const isCompleted = phaseOrder < currentOrder;
          const isActive = phase.key === currentPhase || 
            (currentPhase === 'researching' && phase.key === 'researching');
          const isPending = phaseOrder > currentOrder;

          return (
            <React.Fragment key={phase.key}>
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    relative w-9 h-9 rounded-full flex items-center justify-center
                    transition-all duration-500 border
                    ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : ''}
                    ${isActive ? 'bg-primary/15 border-primary text-primary shadow-[0_0_15px_oklch(0.64_0.195_268/30%)] animate-pulse' : ''}
                    ${isPending ? 'bg-white/[0.02] border-white/[0.08] text-muted-foreground/30' : ''}
                    ${currentPhase === 'failed' ? 'bg-destructive/10 border-destructive/40 text-destructive' : ''}
                  `}
                >
                  {phase.icon}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full border border-primary animate-ping opacity-35" />
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-[10px] font-mono tracking-wider font-semibold uppercase transition-colors
                    ${isCompleted ? 'text-emerald-400' : ''}
                    ${isActive ? 'text-primary' : ''}
                    ${isPending ? 'text-muted-foreground/30' : ''}
                  `}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector line */}
              {index < PHASES.length - 1 && (
                <div
                  className={`
                    flex-1 h-[2px] mx-2 -mt-4 transition-all duration-700
                    ${phaseOrder < currentOrder ? 'bg-emerald-500/40' : 'bg-white/[0.08]'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current message */}
      {currentMessage && currentPhase !== 'completed' && currentPhase !== 'failed' && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.01] shadow-inner">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <p className="text-xs font-mono text-muted-foreground/70">{currentMessage}</p>
        </div>
      )}

      {currentPhase === 'failed' && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-destructive/20 bg-destructive/5 shadow-inner">
          <span className="text-xs text-destructive font-mono">⚠️ {currentMessage || 'Research pipeline encountered an error'}</span>
        </div>
      )}
    </div>
  );
}
