"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { fileToBitmap, paint, rasterize, saveBlob, toGray, type Raster } from "@/lib/image";
import { sci, fixed } from "@/lib/fmt";
import Chart from "@/app/components/Chart";
import FilePick from "@/app/components/FilePick";

type Result = {
  s: Float64Array;
  actual: Float64Array;
  theory: Float64Array;
  rand: Float64Array;
  dct: Float64Array;
  fro: number;
  m: number;
  n: number;
  r: number;
  checks: { orthoU: number; orthoV: number; recon: number; sweeps: number; tSvd: number; tAll: number };
};

const SIZES = [128, 192, 256, 320];

function tableKs(r: number) {
  const base = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 320];
  const out = base.filter((k) => k < r);
  out.push(r);
  return out;
}

export default function EckartYoung() {
  const core = useRef<Core | null>(null);
  const src = useRef<HTMLCanvasElement>(null);
  const approx = useRef<HTMLCanvasElement>(null);
  const resid = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState(192);
  const [raster, setRaster] = useState<Raster | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [prog, setProg] = useState("");
  const [err, setErr] = useState("");
  const [k, setK] = useState(10);
  const [logY, setLogY] = useState(true);
  const [showBase, setShowBase] = useState(true);
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    core.current = new Core();
    return () => core.current?.terminate();
  }, []);

  useEffect(() => {
    if (!file) return;
    let dead = false;
    (async () => {
      try {
        const b = await fileToBitmap(file);
        const r = rasterize(b as ImageBitmap, size);
        if (dead) return;
        setRaster(r);
        setRes(null);
        const g = toGray(r);
        const rgba = new Uint8ClampedArray(r.w * r.h * 4);
        for (let i = 0; i < g.length; i++) {
          rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = g[i];
          rgba[4 * i + 3] = 255;
        }
        paint(src.current, rgba, r.w, r.h);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
    };
  }, [file, size]);

  async function run() {
    if (!raster || !core.current) return;
    setErr("");
    setRes(null);
    setProg("start");
    const g = toGray(raster);
    try {
      const out = await core.current.call<Result>("eckartYoung", { gray: g.buffer, m: raster.h, n: raster.w, seed }, [g.buffer], (p) => {
        if (p.stage === "jacobi") setProg(`jacobi sweep ${p.sweep} (${p.rotations} rotations)`);
        else setProg(`residual k=${p.k}/${p.r}`);
      });
      setRes(out);
      setK((kk) => Math.min(kk, out.r));
      setProg("");
    } catch (e) {
      setErr((e as Error).message);
      setProg("");
    }
  }

  useEffect(() => {
    if (!res || !core.current || !raster) return;
    let dead = false;
    core.current.call<{ approx: Uint8ClampedArray; resid: Uint8ClampedArray }>("e1recon", { k }).then((o) => {
      if (dead) return;
      paint(approx.current, o.approx, res.n, res.m);
      paint(resid.current, o.resid, res.n, res.m);
    });
    return () => {
      dead = true;
    };
  }, [res, k, raster]);

  const series = useMemo(() => {
    if (!res) return null;
    const ks = Array.from({ length: res.r + 1 }, (_, i) => i);
    const ksMain = ks.slice(0, res.r); // k = r has zero theoretical error (log scale cannot show 0)
    const diff = ks.map((i) => Math.abs(res.actual[i] - res.theory[i]));
    const rel = ks.map((i) => (res.theory[i] > 0 ? diff[i] / res.theory[i] : NaN));
    return { ks, ksMain, diff, rel };
  }, [res]);

  function csv() {
    if (!res) return;
    const lines = ["k,sigma_k,actual_fro,theory_fro,abs_diff,rel_diff,dct_rank_k,random_rank_k"];
    for (let i = 0; i <= res.r; i++) {
      const d = Math.abs(res.actual[i] - res.theory[i]);
      lines.push([i, i > 0 ? res.s[i - 1] : "", res.actual[i], res.theory[i], d, res.theory[i] > 0 ? d / res.theory[i] : "", res.dct[i], res.rand[i]].join(","));
    }
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `eckart-young_${res.n}x${res.m}.csv`);
  }

  const kd = res ? Math.abs(res.actual[k] - res.theory[k]) : 0;

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="label mono">E1</div>
          <div className="h1">Eckart–Young</div>
        </div>
        <p className="note" style={{ maxWidth: 560 }}>
          정리: rank ≤ k인 모든 행렬 B에 대해 ‖A − B‖<sub>F</sub> ≥ ‖A − A<sub>k</sub>‖<sub>F</sub> = √(σ<sub>k+1</sub>² + … + σ<sub>r</sub>²).
          실제 오차는 A − A<sub>k</sub>를 원소 단위로 계산한 뒤 제곱합으로, 이론 오차는 잘라낸 특이값만으로 계산합니다.
        </p>
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className="pair" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <div className="cell-head"><span className="label">A (luma)</span><span className="label num">{raster ? `${raster.h}×${raster.w}` : ""}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={src} style={{ width: "100%", height: "auto" }} className={raster ? "" : "hide"} />{!raster && <span className="label">no image</span>}</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--line)" }}>
              <div className="cell-head"><span className="label">A<sub>k</sub>, k = {k}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={approx} style={{ width: "100%", height: "auto" }} className={res ? "" : "hide"} /></div>
            </div>
            <div style={{ borderLeft: "1px solid var(--line)" }}>
              <div className="cell-head"><span className="label">|A − A<sub>k</sub>| (auto scale)</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={resid} style={{ width: "100%", height: "auto" }} className={res ? "" : "hide"} /></div>
            </div>
          </div>
          {res && series && (
            <>
              <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="label">Frobenius error vs k</span>
                  <div className="row" style={{ gap: 14 }}>
                    <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={logY} onChange={(e) => setLogY(e.target.checked)} /> log y</label>
                    <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> other rank-k bases</label>
                  </div>
                </div>
                <Chart
                  height={300}
                  yLog={logY}
                  xLabel="k"
                  cursorX={k}
                  series={[
                    { name: "actual ‖A − Aₖ‖F", x: series.ksMain, y: Array.from(res.actual).slice(0, res.r), width: 3, color: "var(--dim)" },
                    { name: "theory √Σσ²ᵢ (i > k)", x: series.ksMain, y: Array.from(res.theory).slice(0, res.r), width: 1 },
                    ...(showBase
                      ? [
                          { name: "DCT rank-k ‖A − AQₖQₖᵀ‖F", x: series.ksMain, y: Array.from(res.dct).slice(0, res.r), dash: "4 3" },
                          { name: "random rank-k", x: series.ksMain, y: Array.from(res.rand).slice(0, res.r), dash: "1 3" },
                        ]
                      : []),
                  ]}
                />
              </div>
              <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="label">|actual − theory| (absolute, log)</span>
                  <span className="label num">max {sci(Math.max(...series.diff))}</span>
                </div>
                <Chart height={200} yLog xLabel="k" cursorX={k} series={[{ name: "", x: series.ks, y: series.diff }]} />
              </div>
              <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="label">relative |actual − theory| / theory (log)</span>
                  <span className="label num">max {sci(Math.max(...series.rel.filter((x) => isFinite(x))))}</span>
                </div>
                <Chart height={180} yLog xLabel="k" cursorX={k} series={[{ name: "", x: series.ks, y: series.rel }]} />
              </div>
              <div style={{ borderTop: "1px solid var(--line)", overflowX: "auto" }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th>k</th>
                      <th><span className="m">σₖ</span></th>
                      <th>actual</th>
                      <th>theory</th>
                      <th>|Δ|</th>
                      <th>|Δ| / theory</th>
                      <th>energy kept</th>
                      <th>DCT rank-k</th>
                      <th>random rank-k</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableKs(res.r).map((kk) => {
                      const d = Math.abs(res.actual[kk] - res.theory[kk]);
                      const e = Math.max(0, 1 - (res.theory[kk] * res.theory[kk]) / (res.fro * res.fro));
                      return (
                        <tr key={kk} data-hl={kk === k ? "1" : "0"} onClick={() => setK(kk)} style={{ cursor: "pointer" }}>
                          <td>{kk}</td>
                          <td>{kk > 0 ? fixed(res.s[kk - 1], 3) : ""}</td>
                          <td>{fixed(res.actual[kk], 6)}</td>
                          <td>{fixed(res.theory[kk], 6)}</td>
                          <td>{sci(d)}</td>
                          <td>{res.theory[kk] > 0 ? sci(d / res.theory[kk]) : "—"}</td>
                          <td>{(e * 100).toFixed(4)} %</td>
                          <td>{fixed(res.dct[kk], 3)}</td>
                          <td>{fixed(res.rand[kk], 3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {err && <div className="err" style={{ margin: 12 }}>{err}</div>}
        </div>

        <aside>
          <div className="ctl">
            <FilePick label={file ? file.name : "select image"} hint="any photo" onFiles={(f) => setFile(f[0])} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">matrix size (max side)</span></div>
            <div className="seg">{SIZES.map((s) => <button key={s} data-on={size === s ? "1" : "0"} onClick={() => setSize(s)}>{s}</button>)}</div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">random basis seed</span></div>
            <input className="field" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
          </div>
          <div className="ctl stack">
            <button className="btn solid wide" disabled={!raster || !!prog} onClick={run}>{prog ? "Running" : "Run"}</button>
            {prog && <span className="label mono">{prog}</span>}
          </div>
          {res && (
            <>
              <div className="ctl">
                <div className="ctl-head"><span className="label">k</span><span className="mono">{k} / {res.r}</span></div>
                <input type="range" min={0} max={res.r} value={k} onChange={(e) => setK(Number(e.target.value))} />
              </div>
              <div className="readouts">
                <div className="readout"><div className="label">actual</div><div className="v">{fixed(res.actual[k], 4)}</div></div>
                <div className="readout"><div className="label">theory</div><div className="v">{fixed(res.theory[k], 4)}</div></div>
                <div className="readout"><div className="label">|Δ|</div><div className="v">{sci(kd)}</div></div>
                <div className="readout"><div className="label">|Δ| / theory</div><div className="v">{res.theory[k] > 0 ? sci(kd / res.theory[k]) : "—"}</div></div>
                <div className="readout"><div className="label">DCT rank-k</div><div className="v">{fixed(res.dct[k], 2)}</div></div>
                <div className="readout"><div className="label">random rank-k</div><div className="v">{fixed(res.rand[k], 2)}</div></div>
              </div>
              <div className="ctl">
                <div className="label" style={{ marginBottom: 6 }}>decomposition checks</div>
                <dl className="kv">
                  <dt>‖A‖F</dt><dd>{fixed(res.fro, 4)}</dd>
                  <dt>max|UᵀU − I|</dt><dd>{sci(res.checks.orthoU)}</dd>
                  <dt>max|VᵀV − I|</dt><dd>{sci(res.checks.orthoV)}</dd>
                  <dt>‖A − UΣVᵀ‖/‖A‖</dt><dd>{sci(res.checks.recon)}</dd>
                  <dt>sweeps</dt><dd>{res.checks.sweeps}</dd>
                  <dt>svd time</dt><dd>{res.checks.tSvd.toFixed(0)} ms</dd>
                </dl>
              </div>
              <div className="ctl">
                <button className="btn ghost wide" onClick={csv}>Export csv</button>
              </div>
            </>
          )}
          <div className="ctl">
            <p className="note">
              비교군: DCT 기저와 난수 정규직교 기저의 앞 k개 방향으로 투영한 rank-k 근사 AQ<sub>k</sub>Q<sub>k</sub><sup>T</sup>. 정리가 옳다면 두 곡선은 항상 SVD 곡선 위에 있어야 합니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
