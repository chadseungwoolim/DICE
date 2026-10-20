"use client";
import { useEffect, useRef, useState } from "react";
import { frameData, type Pixels } from "@/lib/media";

/** Draws a decoded image, or plays a decoded .akv video in a loop (tap to pause). */
export default function PixelView({ p, className, still = false }: { p: Pixels; className?: string; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(!still);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = p.w;
    c.height = p.h;
    const ctx = c.getContext("2d")!;
    if (p.kind === "image" || still) {
      ctx.putImageData(frameData(p, p.kind === "video" ? Math.floor(p.frames / 2) : 0), 0, 0);
      return;
    }
    if (!playing) return;
    let raf = 0, t0 = 0, last = -1;
    const n = p.w * p.h * 4;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const i = Math.floor(((t - t0) / 1000) * p.fps) % p.frames;
      if (i !== last) {
        ctx.putImageData(new ImageData(p.rgba.slice(i * n, (i + 1) * n), p.w, p.h), 0, 0);
        last = i;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p, playing, still]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ imageRendering: "auto", cursor: p.kind === "video" && !still ? "pointer" : undefined }}
      onClick={p.kind === "video" && !still ? () => setPlaying((x) => !x) : undefined}
    />
  );
}
