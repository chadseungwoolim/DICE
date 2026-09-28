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
process.exit(fail ? 1 : 0);
