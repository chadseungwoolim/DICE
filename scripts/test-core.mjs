// node scripts/test-core.mjs — numerical self-test of public/core.js
import { createRequire } from "module";
const C = createRequire(import.meta.url)("../public/core.js");
let fail = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
const rnd = (m, n, s) => { const r = C.mulberry32(s), A = new Float64Array(m * n); for (let i = 0; i < m * n; i++) A[i] = r() * 255; return A; };
function relRecon(svd, A, m, n) {
  let e = 0, f = 0;
  for (let a = 0; a < m; a++) for (let b = 0; b < n; b++) {
    let v = 0; for (let i = 0; i < svd.r; i++) v += svd.s[i] * svd.U[i][a] * svd.V[i][b];
    e += (v - A[a * n + b]) ** 2; f += A[a * n + b] ** 2;
  }
  return Math.sqrt(e / f);
}
for (const [m, n] of [[48, 32], [32, 48]]) {
  const A = rnd(m, n, m + n);
  const g = C.svdGram(A, m, n), j = C.svdJacobi(A, m, n);
  ok(relRecon(g, A, m, n) < 1e-10, `gram ${m}x${n} reconstruction`);
  ok(relRecon(j, A, m, n) < 1e-12, `jacobi ${m}x${n} reconstruction`);
  ok(Math.abs(g.s[0] - j.s[0]) / j.s[0] < 1e-12, `sigma_1 agrees ${m}x${n}`);
}
const A = rnd(40, 30, 9), ey = C.eckartYoung(A, 40, 30, 1);
let md = 0; for (let k = 0; k < ey.r; k++) md = Math.max(md, Math.abs(ey.actual[k] - ey.theory[k]) / ey.theory[k]);
ok(md < 1e-10, `Eckart-Young actual vs theory max rel diff ${md.toExponential(2)}`);
let dom = true; for (let k = 1; k < ey.r; k++) if (ey.dct[k] < ey.actual[k] - 1e-9 || ey.rand[k] < ey.actual[k] - 1e-9) dom = false;
ok(dom, "DCT and random rank-k errors never below SVD error");
const w = 64, h = 48, rgba = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) { rgba[4 * i] = (i * 7) % 256; rgba[4 * i + 1] = (i >> 3) % 256; rgba[4 * i + 2] = 128; rgba[4 * i + 3] = 255; }
const st = C.prepareImage(rgba, w, h, true);
const lo = await C.encodeState(st, 4, 1, 5, false), hi = await C.encodeState(st, 40, 10, 7, false);
ok(lo.bytes.length < hi.bytes.length, `size grows with rank (${lo.bytes.length} < ${hi.bytes.length})`);
ok(lo.rmse > hi.rmse, `error falls with rank (${lo.rmse.toFixed(2)} > ${hi.rmse.toFixed(2)})`);
const d = await C.decodeAK(hi.bytes);
ok(d.info.w === w && d.info.h === h && d.info.ranks[0] === 40, "decode header round trip");

// .akv video: a moving bar over a static gradient, 24 frames of 48x32
{
  const vw = 48, vh = 32, T = 24, frames = [];
  for (let t = 0; t < T; t++) {
    const f = new Uint8ClampedArray(vw * vh * 4);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const o = 4 * (y * vw + x), bar = Math.abs(x - 2 * t) < 3 ? 120 : 0;
      f[o] = 4 * x + bar; f[o + 1] = 6 * y; f[o + 2] = 90 + bar / 2; f[o + 3] = 255;
    }
    frames.push(f);
  }
  const lowP = { bits: 5, tbits: 6, chan: [{ r: 2, kMean: 4, kMode: 2 }, { r: 1, kMean: 2, kMode: 1 }, { r: 1, kMean: 2, kMode: 1 }] };
  const highP = { bits: 7, tbits: 7, chan: [{ r: 20, kMean: 32, kMode: 24 }, { r: 8, kMean: 16, kMode: 12 }, { r: 8, kMean: 16, kMode: 12 }] };
  const vlo = await C.encodeVideo(frames, vw, vh, 8, lowP), vhi = await C.encodeVideo(frames, vw, vh, 8, highP);
  const dv = await C.decodeAKV(vhi.bytes);
  ok(dv.w === vw && dv.h === vh && dv.frames === T && Math.abs(dv.fps - 8) < 1e-9, "akv header round trip");
  ok(vlo.bytes.length < vhi.bytes.length, `akv size grows with rank (${vlo.bytes.length} < ${vhi.bytes.length})`);
  ok(vhi.psnr > vlo.psnr + 3, `akv PSNR rises with rank (${vlo.psnr.toFixed(1)} -> ${vhi.psnr.toFixed(1)} dB)`);
  ok(vhi.psnr > 28, `akv high-rank PSNR ${vhi.psnr.toFixed(1)} dB > 28 (colour, chroma at 1/2 resolution)`);
  const clamp = await C.encodeVideo(frames, vw, vh, 8, { ...highP, tbits: 8 });
  ok(Math.abs(clamp.psnr - vhi.psnr) < 1e-9, "akv tbits above 7 is clamped (no byte overflow)");
  const auto = await C.encodeVideo(frames, vw, vh, 8);
  ok(auto.ranks[0] <= 8 && auto.bytes.length > 16, `akv auto settings (${auto.bytes.length} B, r=${auto.ranks.join("/")})`);
}

// restoration: preimage projection, restoration stays consistent with the stored factors, PSNR does not drop
{
  const rw = 64, rh = 48, img = new Float64Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    let v = 40;
    if ((x - 20) ** 2 + (y - 24) ** 2 < 140) v = 210;          // disc
    if (x > 38 && x < 58 && y > 8 && y < 40) v = 120;           // rectangle
    img[y * rw + x] = v;
  }
  const svdI = C.svdGram(img, rh, rw);
  const akb = await C.encodeAK({ w: rw, h: rh, bits: 5, channels: [{ svd: svdI, k: 6, rows: rh, cols: rw }] });
  const P = C.makePreimage((await C.parseAK(akb)).channels[0], 5);
  const X = Float64Array.from(img); C.projectPreimage(X, P);
  const Y = Float64Array.from(X); C.projectPreimage(Y, P);
  let d = 0, b0 = 0; for (let i = 0; i < X.length; i++) { d = Math.max(d, Math.abs(X[i] - Y[i])); }
  const Z = Float64Array.from(P.base); C.projectPreimage(Z, P); for (let i = 0; i < Z.length; i++) b0 = Math.max(b0, Math.abs(Z[i] - P.base[i]));
  ok(d < 1e-8 && b0 < 1e-8, `preimage projection is idempotent and fixes A_k (${d.toExponential(1)}, ${b0.toExponential(1)})`);
  const ex = C.restoreChannel(P, { iters: 150, eta: 1, eps: 1, lo: 0, hi: 255, delta: 0, every: 1e9 });
  ok(C.preimageResidual(ex, P) < 1e-2, `exact restoration stays in the preimage set (residual ${C.preimageResidual(ex, P).toExponential(1)})`);
  const rl = C.restoreChannel(P, { iters: 150, eta: 1, eps: 1, lo: 0, hi: 255, delta: 0.5 * P.qerr, every: 1e9 });
  const p0 = C.psnrOf(P.base, img), p1 = C.psnrOf(ex, img), p2 = C.psnrOf(rl, img);
  ok(p1 > p0 && p2 > p0, `restoration raises PSNR on a piecewise-constant image (${p0.toFixed(2)} -> exact ${p1.toFixed(2)}, relaxed ${p2.toFixed(2)} dB)`);
  const comp = C.completeMatrix(img, rh, rw, 6 * (rh + rw + 1), { iters: 30 });
  ok(isFinite(C.psnrOf(comp.X, img)) && comp.samples === 6 * (rh + rw + 1), `matrix completion baseline runs (${C.psnrOf(comp.X, img).toFixed(2)} dB)`);
}
// E5 performance experiment: sizes grow and RMSE falls with k, restoration fields only where asked
{
  const pw = 64, ph = 48, px = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const o = 4 * (y * pw + x), disc = (x - 24) ** 2 + (y - 24) ** 2 < 200;
    px[o] = disc ? 220 : 30 + x; px[o + 1] = disc ? 60 : 2 * y; px[o + 2] = 120; px[o + 3] = 255;
  }
  const pe = await C.performanceExperiment({ rgba: px, w: pw, h: ph, ks: [2, 8, 24], restoreKs: [8], iters: 40 });
  const r = pe.rows;
  ok(r[0].bytes < r[1].bytes && r[1].bytes < r[2].bytes, `E5 size grows with k (${r.map((x) => x.bytes).join(" < ")})`);
  ok(r[0].rmse > r[1].rmse && r[1].rmse > r[2].rmse, `E5 RMSE falls with k (${r.map((x) => x.rmse.toFixed(1)).join(" > ")})`);
  ok(r[1].rmseRestored != null && r[0].rmseRestored == null, `E5 restores only the requested k (RMSE ${r[1].rmse.toFixed(2)} -> ${r[1].rmseRestored.toFixed(2)})`);
  const enc = await C.encodeState(C.prepareImage(px, pw, ph, true), 8, 2, 5, false);
  ok(Math.abs(enc.rmse - r[1].rmse) < 1e-9, "E5 RMSE equals the codec's own RMSE");
}
process.exit(fail ? 1 : 0);
