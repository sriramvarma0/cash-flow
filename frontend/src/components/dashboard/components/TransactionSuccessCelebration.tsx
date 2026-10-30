'use client';

import React, { useEffect, useRef } from 'react';

export type SuccessData = {
  amount: number;
  description?: string;
  category?: string;
  transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT' | 'RECEIVABLE';
  date?: string;
};

interface TransactionSuccessCelebrationProps {
  data: SuccessData | null;
  onDismiss: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'rect' | 'circle' | 'strip';
  width: number;
  height: number;
}

export function TransactionSuccessCelebration({
  data,
  onDismiss
}: TransactionSuccessCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Play a soft pleasant UPI confirmation chime (Google Pay style dual chime)
  useEffect(() => {
    if (!data) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Note 1: 523.25 Hz (C5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        gain1.gain.setValueAtTime(0.12, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Note 2: 783.99 Hz (G5 - energetic resolution)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(783.99, now + 0.12);
        gain2.gain.setValueAtTime(0.16, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.7);
      }
    } catch {
      // Audio autoplay policy might silently prevent sound, ignore
    }
  }, [data]);

  // Confetti Physics Canvas Animation (Fountain eruption from submit button upwards)
  useEffect(() => {
    if (!data) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const colors = [
      '#10b981', // emerald
      '#059669', // dark emerald
      '#3b82f6', // google blue
      '#f59e0b', // google yellow
      '#ea4335', // google red
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#ec4899'  // pink
    ];

    const particles: Particle[] = [];

    const spawnBurst = (count: number, speedMultiplier: number) => {
      // Origin: bottom center right where the submit button is located
      const originX = width / 2;
      const originY = height * 0.88;

      for (let i = 0; i < count; i++) {
        // Spray angle strictly upward (-PI/2) with dynamic horizontal spread
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
        const speed = (14 + Math.random() * 18) * speedMultiplier;
        const size = 6 + Math.random() * 8;
        const shapeRand = Math.random();

        particles.push({
          x: originX + (Math.random() - 0.5) * 90,
          y: originY + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 6,
          vy: Math.sin(angle) * speed,
          size,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.28,
          opacity: 1,
          shape: shapeRand > 0.6 ? 'rect' : shapeRand > 0.3 ? 'strip' : 'circle',
          width: size,
          height: shapeRand > 0.6 ? size * 0.65 : size * 2.4
        });
      }
    };

    // Primary initial burst from submit button to above
    spawnBurst(110, 1.0);

    // Staggered secondary burst 140ms later for continuous fountain effect
    const timeout1 = setTimeout(() => {
      spawnBurst(60, 1.15);
    }, 140);

    let animationId: number;
    const gravity = 0.44;
    const drag = 0.965;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      let alive = false;
      for (const p of particles) {
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.0075;

        if (p.opacity > 0 && p.y < height + 60) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;

          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.shape === 'strip') {
            ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
          } else {
            ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.width);
          }
          ctx.restore();
        }
      }

      if (alive) {
        animationId = requestAnimationFrame(render);
      }
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(timeout1);
      window.removeEventListener('resize', handleResize);
    };
  }, [data]);

  // Auto dismiss after 2.5 seconds
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 2500);

    return () => clearTimeout(timer);
  }, [data, onDismiss]);

  if (!data) return null;

  const isIncome = data.transactionType === 'INCOME';
  const isTransfer = data.transactionType === 'TRANSFER';
  const isReceivable = data.transactionType === 'RECEIVABLE';
  const displayTitle = isIncome
    ? 'Income Recorded'
    : isTransfer
    ? 'Transfer Recorded'
    : isReceivable
    ? 'Receivable / Loan Recorded'
    : 'Payment Recorded';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-ink-950/45 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer"
      onClick={onDismiss}
    >
      {/* Confetti canvas spraying from submit button up */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[10000]" />

      {/* Google Pay / UPI Styled Central Confirmation Card */}
      <div
        className="relative z-[10001] w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl border border-ink-100 transform animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes drawCheck {
            0% {
              stroke-dashoffset: 35;
              opacity: 0;
            }
            40% {
              opacity: 1;
            }
            100% {
              stroke-dashoffset: 0;
              opacity: 1;
            }
          }
          @keyframes gpayPulse {
            0% {
              transform: scale(0.85);
              opacity: 0.8;
            }
            50% {
              transform: scale(1.15);
              opacity: 0.3;
            }
            100% {
              transform: scale(0.85);
              opacity: 0.8;
            }
          }
          .animate-draw-check {
            stroke-dasharray: 35;
            stroke-dashoffset: 35;
            animation: drawCheck 0.45s cubic-bezier(0.65, 0, 0.45, 1) 0.15s forwards;
          }
          .animate-gpay-ring {
            animation: gpayPulse 2s ease-in-out infinite;
          }
        `}</style>

        {/* Central Animated Green Tick Badge (Google Pay UPI style) */}
        <div className="relative mx-auto mb-5 flex items-center justify-center w-24 h-24">
          {/* Concentric ripple halo rings */}
          <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping duration-1000" />
          <div className="absolute -inset-2 rounded-full bg-emerald-500/20 blur-md animate-gpay-ring" />
          <div className="absolute inset-1 rounded-full bg-emerald-100/80" />

          {/* Solid Green Tick Circle */}
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
            <svg
              className="w-10 h-10 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" className="animate-draw-check" />
            </svg>
          </div>
        </div>

        {/* Amount in Google Pay Bold Typography */}
        <div className="mb-1 text-4xl font-extrabold tracking-tight text-ink-950 font-mono">
          ₹{Number(data.amount || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </div>

        {/* Status text with checkmark */}
        <h4 className="text-base font-bold text-emerald-700 flex items-center justify-center gap-1.5 mb-1">
          <span>✓</span> {displayTitle}
        </h4>

        {/* Description Note */}
        {data.description ? (
          <p className="text-sm font-medium text-ink-600 line-clamp-2 px-2 mb-2 italic">
            "{data.description}"
          </p>
        ) : (
          <p className="text-xs text-ink-400 mb-2">Saved to your transactions</p>
        )}

        {/* Category Badge or Warning if unmentioned */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {data.category ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-100 text-ink-700">
              🏷️ {data.category}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <span>⚠️</span> Uncategorized
            </span>
          )}
          <span className="text-xxs text-ink-400">• Just now</span>
        </div>

        {/* Done Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 px-4 rounded-2xl bg-ink-900 hover:bg-ink-800 text-white text-xs font-bold transition shadow-sm active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
