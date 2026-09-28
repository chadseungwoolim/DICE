/*
 * A_k core — SVD, low-rank codec (.ak), experiment math.
 * Runs as a dedicated Web Worker (served from /core.js).
 * In Node (tests) the same functions are exported via module.exports.
 */
'use strict';
(function (root) {
  var EPS = 2.220446049250313e-16;

  /* ------------------------------------------------------------------ */
  /* PRNG                                                                */
  /* ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function dot(a, b, n) {
    var s = 0;
    for (var i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Symmetric eigendecomposition: Householder tridiagonalisation +      */
  /* implicit QL (tred2 / tql2, after JAMA / EISPACK).                   */
  /* Input: symmetric matrix as array of rows. Output eigenvalues in     */
  /* descending order, eigenvectors as rows Z[i].                        */
  /* ------------------------------------------------------------------ */
  function symEig(G, n) {
    var V = G; // rows, modified in place
    var d = new Float64Array(n), e = new Float64Array(n);
    var i, j, k, f, g, h, hh, scale;
    for (j = 0; j < n; j++) d[j] = V[n - 1][j];

    for (i = n - 1; i > 0; i--) {
      scale = 0; h = 0;
      for (k = 0; k < i; k++) scale += Math.abs(d[k]);
      if (scale === 0) {
        e[i] = d[i - 1];
        for (j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
      } else {
        for (k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
        f = d[i - 1];
        g = Math.sqrt(h);
        if (f > 0) g = -g;
        e[i] = scale * g;
        h = h - f * g;
        d[i - 1] = f - g;
        for (j = 0; j < i; j++) e[j] = 0;
        for (j = 0; j < i; j++) {
          f = d[j];
          V[j][i] = f;
          g = e[j] + V[j][j] * f;
          for (k = j + 1; k <= i - 1; k++) {
            g += V[k][j] * d[k];
            e[k] += V[k][j] * f;
          }
          e[j] = g;
        }
        f = 0;
        for (j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
        hh = f / (h + h);
        for (j = 0; j < i; j++) e[j] -= hh * d[j];
        for (j = 0; j < i; j++) {
          f = d[j]; g = e[j];
          for (k = j; k <= i - 1; k++) V[k][j] -= (f * e[k] + g * d[k]);
          d[j] = V[i - 1][j];
          V[i][j] = 0;
        }
      }
      d[i] = h;
    }
    for (i = 0; i < n - 1; i++) {
      V[n - 1][i] = V[i][i];
      V[i][i] = 1;
      h = d[i + 1];
      if (h !== 0) {
        for (k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
        for (j = 0; j <= i; j++) {
          g = 0;
          for (k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
          for (k = 0; k <= i; k++) V[k][j] -= g * d[k];
        }
      }
      for (k = 0; k <= i; k++) V[k][i + 1] = 0;
    }
    for (j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
    V[n - 1][n - 1] = 1;
    e[0] = 0;

    // transpose so that Z[i] is eigenvector column i (row-contiguous rotations)
    var Z = new Array(n);
    for (i = 0; i < n; i++) Z[i] = new Float64Array(n);
    for (k = 0; k < n; k++) { var vk = V[k]; for (i = 0; i < n; i++) Z[i][k] = vk[i]; }

    // tql2
    for (i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    f = 0;
    var tst1 = 0, l, m, iter, p, r, dl1, c, c2, c3, el1, s, s2, zi, zi1, t;
    for (l = 0; l < n; l++) {
      tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
      m = l;
      while (m < n) { if (Math.abs(e[m]) <= EPS * tst1) break; m++; }
      if (m > l) {
        iter = 0;
        do {
          iter++;
          if (iter > 60) break;
          g = d[l];
          p = (d[l + 1] - g) / (2 * e[l]);
          r = Math.hypot(p, 1);
          if (p < 0) r = -r;
          d[l] = e[l] / (p + r);
          d[l + 1] = e[l] * (p + r);
          dl1 = d[l + 1];
          h = g - d[l];
          for (i = l + 2; i < n; i++) d[i] -= h;
          f += h;
          p = d[m];
          c = 1; c2 = c; c3 = c;
          el1 = e[l + 1];
          s = 0; s2 = 0;
          for (i = m - 1; i >= l; i--) {
            c3 = c2; c2 = c; s2 = s;
            g = c * e[i];
            h = c * p;
            r = Math.hypot(p, e[i]);
            e[i + 1] = s * r;
            s = e[i] / r;
            c = p / r;
            p = c * d[i] - s * g;
            d[i + 1] = h + s * (c * g + s * d[i]);
            zi = Z[i]; zi1 = Z[i + 1];
            for (k = 0; k < n; k++) {
              t = zi1[k];
              zi1[k] = s * zi[k] + c * t;
              zi[k] = c * zi[k] - s * t;
            }
          }
          p = -s * s2 * c3 * el1 * e[l] / dl1;
          e[l] = s * p;
          d[l] = c * p;
        } while (Math.abs(e[l]) > EPS * tst1);
      }
      d[l] = d[l] + f;
      e[l] = 0;
    }
    // sort descending
    var idx = new Array(n);
    for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (a, b) { return d[b] - d[a]; });
    var ds = new Float64Array(n), Zs = new Array(n);
    for (i = 0; i < n; i++) { ds[i] = d[idx[i]]; Zs[i] = Z[idx[i]]; }
    return { values: ds, vectors: Zs };
  }

  /* ------------------------------------------------------------------ */
  /* SVD via Gram matrix (fast; used by the codec).                      */
  /* A: Float64Array, row-major m x n.                                   */
  /* Returns s (desc), U[i] (len m), V[i] (len n), r = min(m,n).         */
  /* ------------------------------------------------------------------ */
  function svdGram(A, m, n) {
    var r = Math.min(m, n), i, j, p, q, row, ap, Gp, acc;
    var tall = m >= n;
    var dim = tall ? n : m;
    var G = new Array(dim);
    for (i = 0; i < dim; i++) G[i] = new Float64Array(dim);
    if (tall) {
      for (i = 0; i < m; i++) {
        row = i * n;
        for (p = 0; p < n; p++) {
          ap = A[row + p];
          if (ap === 0) continue;
          Gp = G[p];
          for (q = p; q < n; q++) Gp[q] += ap * A[row + q];
        }
      }
    } else {
      for (p = 0; p < m; p++) {
        Gp = G[p];
        for (q = p; q < m; q++) {
          acc = 0;
          var op = p * n, oq = q * n;
          for (j = 0; j < n; j++) acc += A[op + j] * A[oq + j];
          Gp[q] = acc;
        }
      }
    }
    for (p = 0; p < dim; p++) for (q = 0; q < p; q++) G[p][q] = G[q][p];
    var eig = symEig(G, dim);
    var s = new Float64Array(r), U = new Array(r), V = new Array(r);
    var smax = Math.sqrt(Math.max(eig.values[0], 0));
    for (i = 0; i < r; i++) {
      var sig = Math.sqrt(Math.max(eig.values[i], 0));
      var w = eig.vectors[i];
      if (sig <= smax * 1e-12 || sig === 0) {
        s[i] = 0;
        U[i] = new Float64Array(m);
        V[i] = new Float64Array(n);
        continue;
      }
      s[i] = sig;
      if (tall) {
        V[i] = Float64Array.from(w);
        var u = new Float64Array(m);
        for (j = 0; j < m; j++) {
          acc = 0; row = j * n;
          for (p = 0; p < n; p++) acc += A[row + p] * w[p];
          u[j] = acc / sig;
        }
        U[i] = u;
      } else {
        U[i] = Float64Array.from(w);
        var v = new Float64Array(n);
        for (j = 0; j < m; j++) {
          var wj = w[j];
          if (wj === 0) continue;
          row = j * n;
          for (p = 0; p < n; p++) v[p] += A[row + p] * wj;
        }
        for (p = 0; p < n; p++) v[p] /= sig;
        V[i] = v;
      }
    }
    return { s: s, U: U, V: V, r: r, m: m, n: n };
  }

  /* ------------------------------------------------------------------ */
  /* One-sided Jacobi SVD (Hestenes). High relative accuracy; used by    */
  /* the experiments so that results do not depend on the Gram route.    */
  /* ------------------------------------------------------------------ */
  function svdJacobi(A, m, n, onSweep) {
    if (m < n) {
      var At = new Float64Array(m * n);
      for (var a = 0; a < m; a++) for (var b = 0; b < n; b++) At[b * m + a] = A[a * n + b];
      var T = svdJacobi(At, n, m, onSweep);
      return { s: T.s, U: T.V, V: T.U, r: T.r, m: m, n: n, sweeps: T.sweeps };
    }
    var i, j, p, q, x, y;
    var C = new Array(n), W = new Array(n), norms = new Float64Array(n);
    for (j = 0; j < n; j++) {
      var cj = new Float64Array(m);
      for (i = 0; i < m; i++) cj[i] = A[i * n + j];
      C[j] = cj;
      var wj = new Float64Array(n); wj[j] = 1; W[j] = wj;
    }
    var tol = 1e-15, sweep = 0;
    for (sweep = 0; sweep < 60; sweep++) {
      for (j = 0; j < n; j++) norms[j] = dot(C[j], C[j], m);
      var rot = 0;
      for (p = 0; p < n - 1; p++) {
        var cp = C[p], wp = W[p];
        for (q = p + 1; q < n; q++) {
          var al = norms[p], be = norms[q];
          if (al === 0 || be === 0) continue;
          var cq = C[q];
          var ga = dot(cp, cq, m);
          if (Math.abs(ga) <= tol * Math.sqrt(al * be)) continue;
          rot++;
          var zeta = (be - al) / (2 * ga);
          var t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
          var c = 1 / Math.sqrt(1 + t * t), s = c * t;
          for (i = 0; i < m; i++) { x = cp[i]; y = cq[i]; cp[i] = c * x - s * y; cq[i] = s * x + c * y; }
          var wq = W[q];
          for (i = 0; i < n; i++) { x = wp[i]; y = wq[i]; wp[i] = c * x - s * y; wq[i] = s * x + c * y; }
          norms[p] = al - t * ga;
          norms[q] = be + t * ga;
        }
      }
      if (onSweep) onSweep(sweep + 1, rot);
      if (rot === 0) break;
    }
    for (j = 0; j < n; j++) norms[j] = Math.sqrt(dot(C[j], C[j], m));
    var idx = [];
    for (j = 0; j < n; j++) idx.push(j);
    idx.sort(function (u, v) { return norms[v] - norms[u]; });
    var S = new Float64Array(n), U = new Array(n), V = new Array(n);
    for (var k = 0; k < n; k++) {
      j = idx[k];
      var sg = norms[j];
      S[k] = sg;
      var u = new Float64Array(m);
      if (sg > 0) for (i = 0; i < m; i++) u[i] = C[j][i] / sg;
      U[k] = u;
      V[k] = W[j];
    }
    return { s: S, U: U, V: V, r: n, m: m, n: n, sweeps: sweep + 1 };
  }

  /* orthonormal random vectors (k vectors of length len), modified Gram-Schmidt x2 */
  function randomOrthonormal(k, len, rng) {
    var Q = [], i, j, t;
    for (i = 0; i < k; i++) {
      var v = new Float64Array(len);
      for (t = 0; t < len; t++) v[t] = gaussian(rng);
      for (var pass = 0; pass < 2; pass++) {
        for (j = 0; j < i; j++) {
          var d = dot(v, Q[j], len);
          var qj = Q[j];
          for (t = 0; t < len; t++) v[t] -= d * qj[t];
        }
      }
      var nr = Math.sqrt(dot(v, v, len));
      for (t = 0; t < len; t++) v[t] /= nr;
      Q.push(v);
    }
    return Q;
  }

  function dctBasis(n) {
    var Q = [];
    for (var k = 0; k < n; k++) {
      var v = new Float64Array(n);
      var a = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
      for (var j = 0; j < n; j++) v[j] = a * Math.cos(Math.PI * (2 * j + 1) * k / (2 * n));
      Q.push(v);
    }
    return Q;
  }

  function maxOrthoError(Vs, k, len) {
    var mx = 0;
    for (var i = 0; i < k; i++) for (var j = i; j < k; j++) {
      var d = dot(Vs[i], Vs[j], len) - (i === j ? 1 : 0);
      if (Math.abs(d) > mx) mx = Math.abs(d);
    }
    return mx;
  }

  /* ------------------------------------------------------------------ */
  /* Colour                                                              */
  /* ------------------------------------------------------------------ */
  function rgbaToPlanes(rgba, w, h) {
    var N = w * h;
    var Y = new Float64Array(N), Cb = new Float64Array(N), Cr = new Float64Array(N);
    for (var i = 0, o = 0; i < N; i++, o += 4) {
      var R = rgba[o], G = rgba[o + 1], B = rgba[o + 2];
      Y[i] = 0.299 * R + 0.587 * G + 0.114 * B;
      Cb[i] = -0.168736 * R - 0.331264 * G + 0.5 * B;       // centred (offset 128 removed)
      Cr[i] = 0.5 * R - 0.418688 * G - 0.081312 * B;
    }
    return { Y: Y, Cb: Cb, Cr: Cr };
  }
  function downsample2(P, w, h) {
    var w2 = (w + 1) >> 1, h2 = (h + 1) >> 1, out = new Float64Array(w2 * h2);
    for (var y = 0; y < h2; y++) for (var x = 0; x < w2; x++) {
      var s = 0, c = 0;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var yy = 2 * y + dy, xx = 2 * x + dx;
        if (yy < h && xx < w) { s += P[yy * w + xx]; c++; }
      }
      out[y * w2 + x] = s / c;
    }
    return { P: out, w: w2, h: h2 };
  }
  function upsample2(P, w2, h2, w, h) {
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      var fy = (y + 0.5) / 2 - 0.5; if (fy < 0) fy = 0; if (fy > h2 - 1) fy = h2 - 1;
      var y0 = Math.floor(fy), y1 = Math.min(y0 + 1, h2 - 1), ty = fy - y0;
      for (var x = 0; x < w; x++) {
        var fx = (x + 0.5) / 2 - 0.5; if (fx < 0) fx = 0; if (fx > w2 - 1) fx = w2 - 1;
        var x0 = Math.floor(fx), x1 = Math.min(x0 + 1, w2 - 1), tx = fx - x0;
        var a = P[y0 * w2 + x0] * (1 - tx) + P[y0 * w2 + x1] * tx;
        var b = P[y1 * w2 + x0] * (1 - tx) + P[y1 * w2 + x1] * tx;
        out[y * w + x] = a * (1 - ty) + b * ty;
      }
    }
    return out;
  }
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* ------------------------------------------------------------------ */
  /* float16                                                             */
  /* ------------------------------------------------------------------ */
  var f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  function toF16(v) {
    f32[0] = v;
    var x = u32[0];
    var sign = (x >>> 16) & 0x8000;
    var mant = x & 0x7fffff;
    var exp = (x >>> 23) & 0xff;
    if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
    var e = exp - 127 + 15;
    if (e >= 0x1f) return sign | 0x7c00;
    if (e <= 0) {
      if (e < -10) return sign;
      mant = (mant | 0x800000) >> (1 - e);
      if (mant & 0x1000) mant += 0x2000;
      return sign | (mant >> 13);
    }
    var hv = sign | (e << 10) | (mant >> 13);
    if (mant & 0x1000) hv += 1; // round half up (may carry into exponent — correct behaviour)
    return hv;
  }
  function fromF16(hv) {
    var s = hv & 0x8000 ? -1 : 1;
    var e = (hv >> 10) & 0x1f, m = hv & 0x3ff;
    if (e === 0) return s * m * Math.pow(2, -24);
    if (e === 0x1f) return m ? NaN : s * Infinity;
    return s * (1 + m / 1024) * Math.pow(2, e - 15);
  }

  /* ------------------------------------------------------------------ */
  /* deflate helpers                                                     */
  /* ------------------------------------------------------------------ */
  function hasStreams() { return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'; }
  async function streamBytes(bytes, stream) {
    var ab = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(ab);
  }
  function deflate(bytes) { return streamBytes(bytes, new CompressionStream('deflate-raw')); }
  function inflate(bytes) { return streamBytes(bytes, new DecompressionStream('deflate-raw')); }

  /* ------------------------------------------------------------------ */
  /* .ak codec                                                           */
  /*                                                                     */
  /* header (12 bytes, little endian)                                    */
  /*   0  'A' 'K'                                                        */
  /*   2  version = 1                                                    */
  /*   3  flags  bit0 = payload deflate-raw, bit1 = delta coded          */
  /*   4  width  u16   6  height u16                                     */
  /*   8  nch u8 (1 = luma, 3 = Y + Cb + Cr at 1/2 res)                  */
  /*   9  bits u8 (3..7)                                                 */
  /*  10  reserved u16                                                   */
  /* payload, per channel:                                               */
  /*   rows u16, cols u16, k u16                                         */
  /*   k x (stepA f16, stepB f16)                                        */
  /*   k x (rows bytes of a_i, cols bytes of b_i)                        */
  /*   a_i = sqrt(s_i) u_i, b_i = sqrt(s_i) v_i quantised to             */
  /*   q = round(x / step), |q| <= 2^(bits-1)-1, zigzag(delta) bytes.     */
  /* channel offsets: Y 0, Cb/Cr 128.                                    */
  /* ------------------------------------------------------------------ */
  function zig(d) { return d >= 0 ? 2 * d : -2 * d - 1; }
  function unzig(z) { return z & 1 ? -((z + 1) >> 1) : z >> 1; }

  function writeVec(out, pos, x, len, step, Q, delta) {
    var prev = 0;
    for (var t = 0; t < len; t++) {
      var q = step > 0 ? Math.round(x[t] / step) : 0;
      if (q > Q) q = Q; else if (q < -Q) q = -Q;
      out[pos + t] = delta ? zig(q - prev) : zig(q);
      prev = q;
    }
    return pos + len;
  }

  async function encodeAK(opts) {
    // opts: { w, h, bits, channels: [{ svd, k, rows, cols }] }
    var bits = opts.bits, Q = (1 << (bits - 1)) - 1, delta = opts.delta !== false;
    var size = 0, c, ch;
    for (c = 0; c < opts.channels.length; c++) {
      ch = opts.channels[c];
      size += 6 + ch.k * 4 + ch.k * (ch.rows + ch.cols);
    }
    var body = new Uint8Array(size), dv = new DataView(body.buffer), pos = 0, i, t;
    for (c = 0; c < opts.channels.length; c++) {
      ch = opts.channels[c];
      var svd = ch.svd, k = ch.k;
      dv.setUint16(pos, ch.rows, true); dv.setUint16(pos + 2, ch.cols, true); dv.setUint16(pos + 4, k, true); pos += 6;
      var steps = [];
      for (i = 0; i < k; i++) {
        var rt = Math.sqrt(svd.s[i]);
        var a = new Float64Array(ch.rows), b = new Float64Array(ch.cols), ma = 0, mb = 0;
        for (t = 0; t < ch.rows; t++) { a[t] = rt * svd.U[i][t]; if (Math.abs(a[t]) > ma) ma = Math.abs(a[t]); }
        for (t = 0; t < ch.cols; t++) { b[t] = rt * svd.V[i][t]; if (Math.abs(b[t]) > mb) mb = Math.abs(b[t]); }
        var ha = toF16(ma / Q), hb = toF16(mb / Q);
        dv.setUint16(pos, ha, true); dv.setUint16(pos + 2, hb, true); pos += 4;
        steps.push([a, b, fromF16(ha), fromF16(hb)]);
      }
      for (i = 0; i < k; i++) {
        pos = writeVec(body, pos, steps[i][0], ch.rows, steps[i][2], Q, delta);
        pos = writeVec(body, pos, steps[i][1], ch.cols, steps[i][3], Q, delta);
      }
    }
    var flags = delta ? 2 : 0, payload = body;
    if (opts.deflate !== false && hasStreams()) {
      var z = await deflate(body);
      if (z.length < body.length) { payload = z; flags |= 1; }
    }
    var out = new Uint8Array(12 + payload.length), hv = new DataView(out.buffer);
    out[0] = 0x41; out[1] = 0x4b; out[2] = 1; out[3] = flags;
    hv.setUint16(4, opts.w, true); hv.setUint16(6, opts.h, true);
    out[8] = opts.channels.length; out[9] = bits; hv.setUint16(10, 0, true);
    out.set(payload, 12);
    return out;
  }

  async function parseAK(bytes) {
    if (bytes.length < 12 || bytes[0] !== 0x41 || bytes[1] !== 0x4b) throw new Error('not an .ak file');
    if (bytes[2] !== 1) throw new Error('unsupported .ak version ' + bytes[2]);
    var hv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var flags = bytes[3], w = hv.getUint16(4, true), h = hv.getUint16(6, true), nch = bytes[8], bits = bytes[9];
    var body = bytes.subarray(12);
    if (flags & 1) body = await inflate(body);
    var dv = new DataView(body.buffer, body.byteOffset, body.byteLength), pos = 0;
    var delta = !!(flags & 2), chans = [];
    for (var c = 0; c < nch; c++) {
      var rows = dv.getUint16(pos, true), cols = dv.getUint16(pos + 2, true), k = dv.getUint16(pos + 4, true);
      pos += 6;
      var steps = [];
      for (var i = 0; i < k; i++) { steps.push([fromF16(dv.getUint16(pos, true)), fromF16(dv.getUint16(pos + 2, true))]); pos += 4; }
      var A = [], B = [];
      for (i = 0; i < k; i++) {
        var a = new Float32Array(rows), b = new Float32Array(cols), prev = 0, t, q;
        for (t = 0; t < rows; t++) { q = unzig(body[pos + t]); if (delta) q += prev; prev = q; a[t] = q * steps[i][0]; }
        pos += rows; prev = 0;
        for (t = 0; t < cols; t++) { q = unzig(body[pos + t]); if (delta) q += prev; prev = q; b[t] = q * steps[i][1]; }
        pos += cols;
        A.push(a); B.push(b);
      }
      chans.push({ rows: rows, cols: cols, k: k, A: A, B: B });
    }
    return { w: w, h: h, nch: nch, bits: bits, flags: flags, channels: chans };
  }

  function lowRank(ch) {
    var M = new Float32Array(ch.rows * ch.cols), cols = ch.cols;
    for (var i = 0; i < ch.k; i++) {
      var a = ch.A[i], b = ch.B[i];
      for (var r = 0; r < ch.rows; r++) {
        var ar = a[r];
        if (ar === 0) continue;
        var off = r * cols;
        for (var c = 0; c < cols; c++) M[off + c] += ar * b[c];
      }
    }
    return M;
  }

  async function decodeAK(bytes) {
    var p = await parseAK(bytes);
    var w = p.w, h = p.h, N = w * h, rgba = new Uint8ClampedArray(N * 4), i, o;
    var Y = lowRank(p.channels[0]);
    if (p.nch === 1) {
      for (i = 0, o = 0; i < N; i++, o += 4) { var g = Y[i]; rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255; }
    } else {
      var cb = p.channels[1], cr = p.channels[2];
      var Cb = upsample2(lowRank(cb), cb.cols, cb.rows, w, h);
      var Cr = upsample2(lowRank(cr), cr.cols, cr.rows, w, h);
      for (i = 0, o = 0; i < N; i++, o += 4) {
        var yv = Y[i], b = Cb[i], r = Cr[i];
        rgba[o] = yv + 1.402 * r;
        rgba[o + 1] = yv - 0.344136 * b - 0.714136 * r;
        rgba[o + 2] = yv + 1.772 * b;
        rgba[o + 3] = 255;
      }
    }
    var info = { w: w, h: h, nch: p.nch, bits: p.bits, ranks: p.channels.map(function (c) { return c.k; }), deflate: !!(p.flags & 1) };
    return { rgba: rgba, info: info, luma: Y };
  }

  /* ------------------------------------------------------------------ */
  /* image state (per key)                                               */
  /* ------------------------------------------------------------------ */
  var store = {};

  function prepareImage(rgba, w, h, withChroma) {
    var P = rgbaToPlanes(rgba, w, h);
    var t0 = now();
    var ysvd = svdGram(P.Y, h, w);
    var st = { w: w, h: h, rgba: rgba, Y: P.Y, ysvd: ysvd, tY: now() - t0 };
    if (withChroma) {
      var cb = downsample2(P.Cb, w, h), cr = downsample2(P.Cr, w, h);
      st.cw = cb.w; st.ch = cb.h;
      st.cbsvd = svdGram(cb.P, cb.h, cb.w);
      st.crsvd = svdGram(cr.P, cr.h, cr.w);
    }
    st.tAll = now() - t0;
    var e = 0;
    for (var i = 0; i < ysvd.r; i++) e += ysvd.s[i] * ysvd.s[i];
    st.energy = e;
    return st;
  }

  function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

  function metrics(st, rgba, mono, lumaDecoded) {
    var N = st.w * st.h, se = 0, i, o, d;
    if (mono) {
      for (i = 0; i < N; i++) { d = clamp255(lumaDecoded[i]) - st.Y[i]; se += d * d; }
      se /= N;
    } else {
      var orig = st.rgba;
      for (i = 0, o = 0; i < N; i++, o += 4) {
        d = rgba[o] - orig[o]; se += d * d;
        d = rgba[o + 1] - orig[o + 1]; se += d * d;
        d = rgba[o + 2] - orig[o + 2]; se += d * d;
      }
      se /= 3 * N;
    }
    var rmse = Math.sqrt(se);
    return { rmse: rmse, psnr: rmse > 0 ? 20 * Math.log10(255 / rmse) : Infinity };
  }

  async function encodeState(st, k, kc, bits, mono) {
    k = Math.max(1, Math.min(k, st.ysvd.r));
    var chans = [{ svd: st.ysvd, k: k, rows: st.h, cols: st.w }];
    if (!mono) {
      kc = Math.max(1, Math.min(kc, st.cbsvd.r));
      chans.push({ svd: st.cbsvd, k: kc, rows: st.ch, cols: st.cw });
      chans.push({ svd: st.crsvd, k: kc, rows: st.ch, cols: st.cw });
    }
    var bytes = await encodeAK({ w: st.w, h: st.h, bits: bits, channels: chans });
    var dec = await decodeAK(bytes); // preview is decoded from the exact bytes that will be shared
    var m = metrics(st, dec.rgba, mono, dec.luma);
    var ek = 0;
    for (var i = 0; i < k; i++) ek += st.ysvd.s[i] * st.ysvd.s[i];
    var params = k * (st.h + st.w + 1) + (mono ? 0 : 2 * kc * (st.ch + st.cw + 1));
    return {
      bytes: bytes, rgba: dec.rgba, w: st.w, h: st.h, k: k, kc: mono ? 0 : kc, bits: bits, mono: mono,
      rmse: m.rmse, psnr: m.psnr, energy: st.energy > 0 ? ek / st.energy : 1, params: params,
      rawBytes: st.w * st.h * (mono ? 1 : 3)
    };
  }

  function grayToRGBA(M, N, mapMode) {
    var out = new Uint8ClampedArray(N * 4), lo = 0, hi = 255, i;
    if (mapMode === 'minmax') {
      lo = Infinity; hi = -Infinity;
      for (i = 0; i < N; i++) { if (M[i] < lo) lo = M[i]; if (M[i] > hi) hi = M[i]; }
      if (hi - lo < 1e-12) hi = lo + 1;
    }
    var sc = 255 / (hi - lo);
    for (i = 0; i < N; i++) {
      var g = (M[i] - lo) * sc;
      out[4 * i] = g; out[4 * i + 1] = g; out[4 * i + 2] = g; out[4 * i + 3] = 255;
    }
    return out;
  }

  function reconstruct(sig, Us, Vs, k, m, n) {
    var M = new Float64Array(m * n);
    for (var i = 0; i < k; i++) {
      var s = sig[i], u = Us[i], v = Vs[i];
      if (s === 0) continue;
      for (var r = 0; r < m; r++) {
        var a = s * u[r];
        if (a === 0) continue;
        var off = r * n;
        for (var c = 0; c < n; c++) M[off + c] += a * v[c];
      }
    }
    return M;
  }

  /* ------------------------------------------------------------------ */
  /* Experiment 1: Eckart–Young                                          */
  /* ------------------------------------------------------------------ */
  function eckartYoung(gray, m, n, seed, progress) {
    var t0 = now();
    var svd = svdJacobi(gray, m, n, function (sw, rot) { progress && progress({ stage: 'jacobi', sweep: sw, rotations: rot }); });
    var tSvd = now() - t0;
    var r = svd.r, i, j, c;
    var fro2 = 0;
    for (i = 0; i < m * n; i++) fro2 += gray[i] * gray[i];

    // actual error: explicit residual A - A_k, Frobenius norm summed entry by entry
    var R = Float64Array.from(gray);
    var actual = new Float64Array(r + 1);
    actual[0] = Math.sqrt(fro2);
    for (i = 0; i < r; i++) {
      var s = svd.s[i], u = svd.U[i], v = svd.V[i], acc = 0;
      for (var row = 0; row < m; row++) {
        var a = s * u[row], off = row * n;
        for (c = 0; c < n; c++) { var val = R[off + c] - a * v[c]; R[off + c] = val; acc += val * val; }
      }
      actual[i + 1] = Math.sqrt(acc);
      if (progress && (i % 16 === 0)) progress({ stage: 'residual', k: i + 1, r: r });
    }
    // theoretical error: sqrt(sum_{i>k} sigma_i^2), compensated reverse sum
    var theory = new Float64Array(r + 1), sum = 0, comp = 0;
    theory[r] = 0;
    for (i = r - 1; i >= 0; i--) {
      var yv = svd.s[i] * svd.s[i] - comp, tv = sum + yv;
      comp = (tv - sum) - yv; sum = tv;
      theory[i] = Math.sqrt(sum);
    }
    // competing rank-k approximations: A Q_k Q_k^T for random and DCT orthonormal bases
    function basisError(Q) {
      var e = new Float64Array(r + 1), kept = 0;
      e[0] = Math.sqrt(fro2);
      var B = new Float64Array(m);
      for (var kk = 0; kk < r; kk++) {
        var q = Q[kk];
        for (var rr = 0; rr < m; rr++) { var ac = 0, of = rr * n; for (var cc = 0; cc < n; cc++) ac += gray[of + cc] * q[cc]; B[rr] = ac; }
        kept += dot(B, B, m);
        e[kk + 1] = Math.sqrt(Math.max(0, fro2 - kept));
      }
      return e;
    }
    var rng = mulberry32(seed);
    var rand = basisError(randomOrthonormal(n, n, rng));
    var dct = basisError(dctBasis(n));
    var checks = {
      orthoU: maxOrthoError(svd.U, r, m),
      orthoV: maxOrthoError(svd.V, r, n),
      recon: actual[r] / Math.sqrt(fro2),
      sweeps: svd.sweeps,
      tSvd: tSvd,
      tAll: now() - t0
    };
    return { s: svd.s, actual: actual, theory: theory, rand: rand, dct: dct, fro: Math.sqrt(fro2), m: m, n: n, r: r, checks: checks, _svd: svd };
  }

  /* ------------------------------------------------------------------ */
  /* Experiment 2: singular vectors                                      */
  /* ------------------------------------------------------------------ */
  var e2 = {};
  var e1 = null;
  function e2Prepare(p) {
    var t0 = now();
    e2.N = p.n;
    e2.A = p.a; e2.sa = svdJacobi(p.a, p.n, p.n);
    e2.B = p.b || null; e2.sb = p.b ? svdJacobi(p.b, p.n, p.n) : null;
    return { n: p.n, r: e2.sa.r, hasB: !!p.b, sA: e2.sa.s, sB: e2.sb ? e2.sb.s : null, t: now() - t0 };
  }
  function e2Run(p) {
    var N = e2.N, k = Math.max(1, Math.min(p.k, N)), sa = e2.sa, sb = e2.sb, mode = p.mode;
    var rng = mulberry32(p.seed >>> 0);
    var sigN = sa.s.subarray(0, k), Un = sa.U.slice(0, k), Vn = sa.V.slice(0, k);
    var sigM = Float64Array.from(sigN), Um = Un.slice(), Vm = Vn.slice();
    var i, note = '';
    var needB = mode === 'swapUV' || mode === 'swapU' || mode === 'swapV' || mode === 'sigmaB';
    if (needB && !sb) throw new Error('image B required for this mode');
    switch (mode) {
      case 'randU': Um = randomOrthonormal(k, N, rng); break;
      case 'randV': Vm = randomOrthonormal(k, N, rng); break;
      case 'randUV': Um = randomOrthonormal(k, N, rng); Vm = randomOrthonormal(k, N, rng); break;
      case 'swapUV': Um = sb.U.slice(0, k); Vm = sb.V.slice(0, k); break;
      case 'swapU': Um = sb.U.slice(0, k); break;
      case 'swapV': Vm = sb.V.slice(0, k); break;
      case 'perm': {
        var perm = []; for (i = 0; i < k; i++) perm.push(i);
        for (i = k - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
        Um = perm.map(function (x) { return sa.U[x]; }); Vm = perm.map(function (x) { return sa.V[x]; });
        note = 'pairing sigma_i <-> (u,v)_pi(i)';
        break;
      }
      case 'sign': {
        Um = Un.map(function (u) { if (rng() < 0.5) { var w = new Float64Array(u.length); for (var q = 0; q < u.length; q++) w[q] = -u[q]; return w; } return u; });
        break;
      }
      case 'sigmaB': sigM = Float64Array.from(sb.s.subarray(0, k)); break;
      default: throw new Error('unknown mode');
    }
    var Mn = reconstruct(sigN, Un, Vn, k, N, N);
    var Mm = reconstruct(sigM, Um, Vm, k, N, N);
    var NN = N * N, D = new Float64Array(NN), dmax = 0, fn = 0, fm = 0, en = 0, em = 0, dd;
    for (i = 0; i < NN; i++) {
      D[i] = Math.abs(Mn[i] - Mm[i]); if (D[i] > dmax) dmax = D[i];
      fn += Mn[i] * Mn[i]; fm += Mm[i] * Mm[i];
      dd = Mn[i] - e2.A[i]; en += dd * dd;
      dd = Mm[i] - e2.A[i]; em += dd * dd;
    }
    var dsig = 0;
    for (i = 0; i < k; i++) dsig = Math.max(dsig, Math.abs(sigM[i] - sigN[i]));
    var sigSame = mode !== 'sigmaB';
    return {
      k: k, mode: mode, note: note,
      orig: grayToRGBA(e2.A, NN, 'clamp'),
      normal: grayToRGBA(Mn, NN, p.map),
      modified: grayToRGBA(Mm, NN, p.map),
      diff: grayToRGBA(D, NN, 'minmax'),
      sigmaNormal: Float64Array.from(sigN), sigmaModified: sigM,
      maxSigmaDiff: dsig, sigmaIdentical: sigSame && dsig === 0,
      froNormal: Math.sqrt(fn), froModified: Math.sqrt(fm), froSigma: Math.sqrt(dotSelf(sigN)),
      rmseNormal: Math.sqrt(en / NN), rmseModified: Math.sqrt(em / NN),
      orthoU: maxOrthoError(Um, k, N), orthoV: maxOrthoError(Vm, k, N),
      diffMax: dmax
    };
  }
  function dotSelf(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return s; }

  /* ------------------------------------------------------------------ */
  /* worker protocol                                                     */
  /* ------------------------------------------------------------------ */
  var handlers = {
    load: function (p) {
      var st = prepareImage(new Uint8ClampedArray(p.rgba), p.w, p.h, true);
      store[p.key] = st;
      return {
        r: st.ysvd.r, rc: st.cbsvd.r, s: Float64Array.from(st.ysvd.s), w: st.w, h: st.h, t: st.tAll
      };
    },
    encode: async function (p) {
      var st = store[p.key];
      if (!st) throw new Error('image not loaded');
      var res = await encodeState(st, p.k, p.kc, p.bits, p.mono);
      return { res: res, transfer: [res.bytes.buffer, res.rgba.buffer] };
    },
    sweep: async function (p) {
      // encode one image at several ranks (experiment 3)
      var st = store[p.key];
      if (!st) throw new Error('image not loaded');
      var out = [], tr = [];
      for (var i = 0; i < p.ranks.length; i++) {
        var k = p.ranks[i], kc = p.mono ? 0 : Math.max(1, Math.ceil(k / 4));
        var res = await encodeState(st, k, kc, p.bits, p.mono);
        out.push({ k: res.k, kc: res.kc, size: res.bytes.length, rmse: res.rmse, psnr: res.psnr, rgba: res.rgba, bytes: res.bytes });
        tr.push(res.rgba.buffer, res.bytes.buffer);
      }
      return { res: out, transfer: tr };
    },
    drop: function (p) { delete store[p.key]; return true; },
    decode: async function (p) {
      var d = await decodeAK(new Uint8Array(p.bytes));
      return { res: { rgba: d.rgba, info: d.info }, transfer: [d.rgba.buffer] };
    },
    eckartYoung: function (p, progress) {
      var g = new Float64Array(p.gray);
      var out = eckartYoung(g, p.m, p.n, p.seed >>> 0, progress);
      e1 = { gray: g, m: p.m, n: p.n, svd: out._svd };
      delete out._svd;
      return out;
    },
    e1recon: function (p) {
      if (!e1) throw new Error('run the experiment first');
      var k = Math.max(0, Math.min(p.k, e1.svd.r));
      var M = reconstruct(e1.svd.s, e1.svd.U, e1.svd.V, k, e1.m, e1.n);
      var N = e1.m * e1.n, R = new Float64Array(N), i;
      for (i = 0; i < N; i++) R[i] = Math.abs(e1.gray[i] - M[i]);
      var a = grayToRGBA(M, N, 'clamp'), b = grayToRGBA(R, N, 'minmax');
      return { res: { approx: a, resid: b }, transfer: [a.buffer, b.buffer] };
    },
    e2prepare: function (p) {
      return e2Prepare({ n: p.n, a: new Float64Array(p.a), b: p.b ? new Float64Array(p.b) : null });
    },
    e2run: function (p) {
      var r = e2Run(p);
      return { res: r, transfer: [r.orig.buffer, r.normal.buffer, r.modified.buffer, r.diff.buffer] };
    }
  };

  var api = {
    symEig: symEig, svdGram: svdGram, svdJacobi: svdJacobi, encodeAK: encodeAK, decodeAK: decodeAK, parseAK: parseAK,
    prepareImage: prepareImage, encodeState: encodeState, eckartYoung: eckartYoung, e2Prepare: e2Prepare, e2Run: e2Run,
    toF16: toF16, fromF16: fromF16, randomOrthonormal: randomOrthonormal, mulberry32: mulberry32, handlers: handlers
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.onmessage = async function (e) {
      var msg = e.data, id = msg.id;
      var h = handlers[msg.type];
      if (!h) { self.postMessage({ id: id, ok: false, error: 'unknown ' + msg.type }); return; }
      try {
        var out = await h(msg.p, function (pr) { self.postMessage({ id: id, progress: pr }); });
        if (out && out.transfer) self.postMessage({ id: id, ok: true, r: out.res }, out.transfer);
        else self.postMessage({ id: id, ok: true, r: out });
      } catch (err) {
        self.postMessage({ id: id, ok: false, error: (err && err.message) || String(err) });
      }
    };
  }
})(this);
