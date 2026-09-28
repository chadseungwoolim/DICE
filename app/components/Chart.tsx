"use client";
import { useEffect, useId, useRef, useState } from "react";

export type Series = {
  name: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  dash?: string;
  width?: number;
  color?: string; // css color; defaults to foreground
  points?: boolean; // draw square markers
  line?: boolean; // default true
};
export type Marker = { x?: number; y?: number; label: string; color?: string };

type Props = {
  series: Series[];
  xLog?: boolean;
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  markers?: Marker[];
  cursorX?: number;
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
};

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = (span / n) / step0;
  const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  const dense = b - a <= 2;
  for (let e = a; e <= b; e++) {
    for (const m of dense ? [1, 2, 5] : [1]) {
      const v = m * Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}
const defFmt = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e5 || a < 1e-3) return v.toExponential(0);
  if (a >= 100) return v.toFixed(0);
  return String(Number(v.toPrecision(3)));
};

export default function Chart(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cid = "c" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [W, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.floor(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = p.height ?? 260;
  const m = { l: 58, r: 14, t: 12, b: 38 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const ok = (v: number, log?: boolean) => isFinite(v) && (!log || v > 0);
  let xs: number[] = [], ys: number[] = [];
  p.series.forEach((s) => {
    for (let i = 0; i < s.x.length; i++) {
      if (ok(s.x[i], p.xLog) && ok(s.y[i], p.yLog)) {
        xs.push(s.x[i]);
        ys.push(s.y[i]);
      }
    }
  });
  const ext = (a: number[]) => (a.length ? [Math.min(...a), Math.max(...a)] : [0, 1]);
  let [x0, x1] = p.xDomain ?? ext(xs);
  let [y0, y1] = p.yDomain ?? ext(ys);
  if (x1 === x0) { x1 = x0 + (p.xLog ? x0 : 1); }
  if (y1 === y0) { y1 = y0 + (p.yLog ? y0 : 1); if (!p.yLog) y0 -= 1; }
  if (!p.yDomain && !p.yLog) { const pad = (y1 - y0) * 0.04; y1 += pad; if (y0 !== 0) y0 -= pad; }
  if (p.yLog && !p.yDomain) { y0 = y0 / 1.5; y1 = y1 * 1.5; }

  const tx = (v: number) => m.l + (p.xLog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0)) * iw;
  const ty = (v: number) => m.t + ih - (p.yLog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0)) * ih;
  const xt = p.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.floor(iw / 90)));
  const yt = p.yLog ? logTicks(y0, y1) : niceTicks(y0, y1, 5);
  const xf = p.xFmt ?? defFmt, yf = p.yFmt ?? defFmt;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10 }}>
        {yt.map((v) => (
          <g key={"y" + v}>
            <line x1={m.l} x2={W - m.r} y1={ty(v)} y2={ty(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={m.l - 6} y={ty(v) + 3} textAnchor="end" fill="var(--mid)">{yf(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={"x" + v}>
            <line x1={tx(v)} x2={tx(v)} y1={m.t} y2={m.t + ih} stroke="var(--line)" strokeWidth={1} />
            <text x={tx(v)} y={m.t + ih + 14} textAnchor="middle" fill="var(--mid)">{xf(v)}</text>
          </g>
        ))}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="none" stroke="var(--fg)" strokeWidth={1} />
        {p.cursorX !== undefined && ok(p.cursorX, p.xLog) && p.cursorX >= x0 && p.cursorX <= x1 && (
          <line x1={tx(p.cursorX)} x2={tx(p.cursorX)} y1={m.t} y2={m.t + ih} stroke="var(--fg)" strokeDasharray="2 3" />
        )}
        <clipPath id={cid}>
          <rect x={m.l} y={m.t} width={iw} height={ih} />
        </clipPath>
        <g clipPath={`url(#${cid})`}>
          {p.series.map((s, si) => {
            let d = "";
            let pen = false;
            const pts: [number, number][] = [];
            for (let i = 0; i < s.x.length; i++) {
              const X = s.x[i], Y = s.y[i];
              if (!ok(X, p.xLog) || !ok(Y, p.yLog)) { pen = false; continue; }
              const px = tx(X), py = ty(Y);
              d += (pen ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
              pen = true;
              pts.push([px, py]);
            }
            const c = s.color ?? "var(--fg)";
            return (
              <g key={si}>
                {s.line !== false && <path d={d} fill="none" stroke={c} strokeWidth={s.width ?? 1} strokeDasharray={s.dash} />}
                {s.points && pts.map(([a, b], i) => <rect key={i} x={a - 2.5} y={b - 2.5} width={5} height={5} fill={c} />)}
              </g>
            );
          })}
          {(p.markers || []).map((mk, i) => {
            const c = mk.color ?? "var(--signal)";
            if (mk.x !== undefined && ok(mk.x, p.xLog)) {
              const X = tx(mk.x);
              return (
                <g key={i}>
                  <line x1={X} x2={X} y1={m.t} y2={m.t + ih} stroke={c} strokeWidth={1} />
                  <text x={X + 4} y={m.t + 12 + i * 12} fill={c}>{mk.label}</text>
                </g>
              );
            }
            if (mk.y !== undefined && ok(mk.y, p.yLog)) {
              const Y = ty(mk.y);
              return (
                <g key={i}>
                  <line x1={m.l} x2={m.l + iw} y1={Y} y2={Y} stroke={c} strokeWidth={1} strokeDasharray="4 3" />
                  <text x={m.l + iw - 4} y={Y - 4} fill={c} textAnchor="end">{mk.label}</text>
                </g>
              );
            }
            return null;
          })}
        </g>
        {p.xLabel && <text x={m.l + iw} y={H - 6} textAnchor="end" fill="var(--mid)" style={{ letterSpacing: "0.08em" }}>{p.xLabel}</text>}
      </svg>
      {(p.yLabel || p.series.length > 1) && (
        <div className="row" style={{ padding: "4px 0 0 " + m.l + "px", justifyContent: "flex-start", gap: 18, flexWrap: "wrap" }}>
          {p.yLabel && <span className="label">y: {p.yLabel}</span>}
          {p.series.filter((s) => s.name).map((s, i) => (
            <span key={i} className="label" style={{ display: "inline-flex", alignItems: "center", gap: 6, textTransform: "none", letterSpacing: "0.04em" }}>
              <svg width="22" height="8">
                {s.line !== false && <line x1="0" x2="22" y1="4" y2="4" stroke={s.color ?? "var(--fg)"} strokeDasharray={s.dash} strokeWidth={s.width ?? 1} />}
                {s.points && <rect x="8.5" y="1.5" width="5" height="5" fill={s.color ?? "var(--fg)"} />}
              </svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
