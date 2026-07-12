import { useEffect, useRef } from "react";

const ACCENT = "163, 230, 53"; // --color-accent, as rgb components

/**
 * Animated dot-grid hero: two mirrored ripple sources (the two models under
 * comparison) pulse through a faint grid. Static frame when the user prefers
 * reduced motion.
 */
function DotGridHero() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);

    const SPACING = 26;

    function draw(t: number) {
      ctx.clearRect(0, 0, w, h);
      const time = t / 1000;
      const foci = [
        { x: w * 0.32, y: h * 0.5, phase: 0 },
        { x: w * 0.68, y: h * 0.5, phase: Math.PI },
      ];

      // Hairline between the two clusters — the comparison axis.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(foci[0]!.x, foci[0]!.y);
      ctx.lineTo(foci[1]!.x, foci[1]!.y);
      ctx.stroke();

      for (let gx = SPACING / 2; gx < w; gx += SPACING) {
        for (let gy = SPACING / 2; gy < h; gy += SPACING) {
          let glow = 0;
          let nearest = Infinity;
          for (const f of foci) {
            const d = Math.hypot(gx - f.x, gy - f.y);
            nearest = Math.min(nearest, d);
            // Ripple travelling outward from the focus, fading with distance.
            glow += Math.max(0, Math.sin(d / 40 - time * 1.3 + f.phase)) * Math.exp(-d / 300);
          }
          const radius = 1 + glow * 1.2;
          // Only dots hugging a cluster centre wear the accent; the rest stay neutral.
          ctx.fillStyle =
            nearest < 55
              ? `rgba(${ACCENT}, ${0.25 + glow * 0.55})`
              : `rgba(255, 255, 255, ${0.06 + glow * 0.3})`;
          ctx.beginPath();
          ctx.arc(gx, gy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // A thin ring and bright core at each cluster centre.
      for (const f of foci) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
        ctx.beginPath();
        ctx.arc(f.x, f.y, 86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${ACCENT}, 0.9)`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      draw(0);
    } else {
      const loop = (t: number) => {
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden="true" />;
}

export function Home({ onViewDashboard }: { onViewDashboard: () => void }) {
  return (
    <section className="relative overflow-hidden">
      <DotGridHero />
      {/* Fade the grid out toward the edges so it sits behind the type, not against it. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_center,transparent_40%,var(--color-surface)_100%)]" />

      <div className="relative z-10 flex min-h-[72vh] flex-col items-center justify-center py-28 text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
          Gemini · GPT · judged by Claude
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-bold tracking-tight text-zinc-50 sm:text-7xl">
          LLM Evaluation Platform
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">
          Benchmark multiple LLM providers on identical tasks — scored against rubrics by an
          independent AI judge.
        </p>
        <button
          onClick={onViewDashboard}
          className="mt-12 rounded-full bg-accent px-8 py-3 text-sm font-semibold text-black transition hover:brightness-110"
        >
          View Dashboard →
        </button>
      </div>
    </section>
  );
}
