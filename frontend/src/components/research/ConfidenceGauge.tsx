'use client';

import React from 'react';

interface ConfidenceGaugeProps {
  score: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  interactive?: boolean;
}

export default function ConfidenceGauge({
  score,
  size = 120,
  strokeWidth = 10,
  interactive = true,
}: ConfidenceGaugeProps) {
  // Clamp score
  const clampedScore = Math.max(0, Math.min(100, score));

  // Circle geometry
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Determine color based on score (red to yellow to green)
  const getGaugeColor = (val: number) => {
    if (val >= 80) return 'oklch(0.72 0.16 140)'; // emerald
    if (val >= 60) return 'oklch(0.75 0.15 70)';  // amber
    return 'oklch(0.58 0.18 25)';   // crimson
  };

  const color = getGaugeColor(clampedScore);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${
        interactive ? 'hover:scale-105' : ''
      } transition-transform duration-300`}
      style={{ width: size, height: size }}
      id={`confidence-gauge-${score}`}
    >
      <svg
        width={size}
        height={size}
        className="transform -rotate-90 filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
      >
        {/* Track circle (background) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 5px ${color})`,
          }}
        />
      </svg>

      {/* Center Text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-extrabold tracking-tighter text-foreground font-mono">
          {clampedScore}
        </span>
        <span className="text-[9px] uppercase font-extrabold text-muted-foreground/40 tracking-widest -mt-0.5">
          Confidence
        </span>
      </div>
    </div>
  );
}
