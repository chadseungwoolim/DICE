// Psychometric analysis for experiment E3. Everything is derived from measured records.

export type Obs = { img: string; k: number; size: number; ratio: number; yes: boolean; control: boolean };

export type LevelStat = {
  k: number;
  size: number; // mean .ak bytes over target images at this rank
  ratio: number; // mean original/compressed over target images
  n: number;
  yes: number;
  rate: number;
  cn: number; // control trials
  cyes: number;
  crate: number;
};

export function byLevel(obs: Obs[], sizeOf: (k: number) => { size: number; ratio: number }): LevelStat[] {
  const m = new Map<number, LevelStat>();
  for (const o of obs) {
    let s = m.get(o.k);
    if (!s) {
      const z = sizeOf(o.k);
      s = { k: o.k, size: z.size, ratio: z.ratio, n: 0, yes: 0, rate: NaN, cn: 0, cyes: 0, crate: NaN };
      m.set(o.k, s);
    }
    if (o.control) {
      s.cn++;
      if (o.yes) s.cyes++;
    } else {
      s.n++;
      if (o.yes) s.yes++;
    }
  }
  const out = Array.from(m.values()).sort((a, b) => a.size - b.size);
  out.forEach((s) => {
    s.rate = s.n ? s.yes / s.n : NaN;
    s.crate = s.cn ? s.cyes / s.cn : NaN;
  });
  return out;
}

/** Logistic regression p = 1/(1+exp(-(a + b*x))) by Newton-Raphson with a tiny ridge term. x = log10(bytes). */
export function logisticFit(xs: number[], ys: number[]): { a: number; b: number; ok: boolean; separated: boolean } | null {
  const n = xs.length;
  if (n < 3) return null;
  const pos = ys.filter((y) => y > 0.5).length;
  if (pos === 0 || pos === n) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  let a = 0, b = 0;
  const lam = 1e-4;
  let separated = false;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = lam, h01 = 0, h11 = lam;
    for (let i = 0; i < n; i++) {
      const x = xs[i] - mx;
      const p = 1 / (1 + Math.exp(-(a + b * x)));
      const w = Math.max(p * (1 - p), 1e-12);
      g0 += ys[i] - p;
      g1 += (ys[i] - p) * x;
      h00 += w;
      h01 += w * x;
      h11 += w * x * x;
    }
    g0 -= lam * a;
    g1 -= lam * b;
    const det = h00 * h11 - h01 * h01;
    if (!isFinite(det) || det <= 0) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    if (Math.abs(b) > 200) {
      separated = true;
      break;
    }
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  // back to un-centred parameterisation
  return { a: a - b * mx, b, ok: isFinite(a) && isFinite(b), separated };
}

export function logit(t: number) {
  return Math.log(t / (1 - t));
}

/** Smallest measured level such that it and every larger level reach rate >= tau. */
export function empiricalMin(levels: LevelStat[], tau: number): LevelStat | null {
  const L = levels.filter((l) => l.n > 0).sort((a, b) => a.size - b.size);
  let best: LevelStat | null = null;
  for (let i = L.length - 1; i >= 0; i--) {
    if (L[i].rate >= tau) best = L[i];
    else break;
  }
  return best;
}

/** Largest rate drop per decade of bytes between adjacent levels. */
export function steepest(levels: LevelStat[]): { lo: LevelStat; hi: LevelStat; slope: number } | null {
  const L = levels.filter((l) => l.n > 0).sort((a, b) => a.size - b.size);
  let best: { lo: LevelStat; hi: LevelStat; slope: number } | null = null;
  for (let i = 0; i + 1 < L.length; i++) {
    const dx = Math.log10(L[i + 1].size) - Math.log10(L[i].size);
    if (dx <= 0) continue;
    const s = (L[i + 1].rate - L[i].rate) / dx;
    if (!best || s > best.slope) best = { lo: L[i], hi: L[i + 1], slope: s };
  }
  return best && best.slope > 0 ? best : null;
}

/** Per target image: smallest size from which every larger measured level is judged "cat" by majority >= tau. */
export function perImage(obs: Obs[], tau: number) {
  const imgs = new Map<string, Map<number, { size: number; yes: number; n: number }>>();
  for (const o of obs) {
    if (o.control) continue;
    let m = imgs.get(o.img);
    if (!m) imgs.set(o.img, (m = new Map()));
    const e = m.get(o.k) || { size: o.size, yes: 0, n: 0 };
    e.n++;
    if (o.yes) e.yes++;
    m.set(o.k, e);
  }
  const out: { img: string; k: number | null; size: number | null }[] = [];
  imgs.forEach((m, img) => {
    const L = Array.from(m.entries()).map(([k, e]) => ({ k, ...e })).sort((a, b) => a.size - b.size);
    let best: { k: number; size: number } | null = null;
    for (let i = L.length - 1; i >= 0; i--) {
      if (L[i].yes / L[i].n >= tau) best = { k: L[i].k, size: L[i].size };
      else break;
    }
    out.push({ img, k: best ? best.k : null, size: best ? best.size : null });
  });
  return out;
}

export function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
