"use client";
import { useEffect, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { fileToBitmap, paint, rasterize, saveBlob, toGray, type Raster } from "@/lib/image";
import { fixed } from "@/lib/fmt";
import Chart from "@/app/components/Chart";
import FilePick from "@/app/components/FilePick";

type Row = {
  k: number;
  bytes: number;
  stored: number;
  psnrAk: number;
  psnrExact: number;
  psnrRestored: number;
  psnrCompletion?: number;
  curveExact: [number, number][];
  curve: [number, number][];
  residualExact: number;
  qerr: number;
  delta: number;
};
type Result = { rows: Row[]; m: number; n: number; detail: { ak?: Uint8ClampedArray; restored?: Uint8ClampedArray; completion?: Uint8ClampedArray } | null };

const SIZES = [192, 256, 320];
const KSETS: Record<string, number[]> = { quick: [8, 16, 32], full: [4, 8, 12, 16, 24, 32, 48] };

export default function Restoration() {
  const core = useRef<Core | null>(null);
  const src = useRef<HTMLCanvasElement>(null);
  const cAk = useRef<HTMLCanvasElement>(null);
  const cRe = useRef<HTMLCanvasElement>(null);
  const cCo = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState(256);
  const [raster, setRaster] = useState<Raster | null>(null);
  const [kset, setKset] = useState<"quick" | "full">("quick");
  const [detailK, setDetailK] = useState(16);
  const [iters, setIters] = useState(120);
  const [completion, setCompletion] = useState(true);
  const [res, setRes] = useState<Result | null>(null);
  const [prog, setProg] = useState("");
  const [err, setErr] = useState("");

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
    const ks = KSETS[kset];
    const dk = ks.includes(detailK) ? detailK : ks[Math.floor(ks.length / 2)];
    setProg(`k = ${ks[0]} (0/${ks.length})`);
    const g = toGray(raster);
    try {
      const out = await core.current.call<Result>(
        "restorationExperiment",
        { gray: g.buffer, m: raster.h, n: raster.w, ks, bits: 5, iters, completion, completionIters: 40, detailK: dk },
        [g.buffer],
        (p) => p.stage === "k" && setProg(`k = ${ks[Math.min(p.done, ks.length - 1)]} (${p.done}/${p.total})`)
      );
      setRes(out);
      setDetailK(dk);
      setProg("");
    } catch (e) {
      setErr((e as Error).message);
      setProg("");
    }
  }

  useEffect(() => {
    if (!res?.detail) return;
    if (res.detail.ak) paint(cAk.current, res.detail.ak, res.n, res.m);
    if (res.detail.restored) paint(cRe.current, res.detail.restored, res.n, res.m);
    if (res.detail.completion) paint(cCo.current, res.detail.completion, res.n, res.m);
  }, [res]);

  function csv() {
    if (!res) return;
    const lines = ["k,bytes,stored_values,psnr_Ak,psnr_exact_set,psnr_relaxed_set,psnr_matrix_completion,quant_error_est,delta"];
    for (const r of res.rows) lines.push([r.k, r.bytes, r.stored, r.psnrAk, r.psnrExact, r.psnrRestored, r.psnrCompletion ?? "", r.qerr, r.delta].join(","));
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `restoration_${res.n}x${res.m}.csv`);
  }

  const d = res?.rows.find((r) => r.k === detailK);
  const ks = res ? res.rows.map((r) => r.k) : [];

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="label mono">E4</div>
          <div className="h1">Restoration</div>
        </div>
        <p className="note" style={{ maxWidth: 600 }}>
          A<sub>k</sub>를 만드는 원본은 하나가 아니라 집합 S = {"{"}A<sub>k</sub> + R : U<sub>k</sub><sup>T</sup>R = 0, RV<sub>k</sub> = 0{"}"}(아핀 부분공간)입니다.
          여기에 픽셀 값 0~255(볼록집합 B)를 더하고, S ∩ B 안에서 전변동 TV(X)가 가장 작은 해를 사영 경사법 X ← P<sub>B</sub>(P<sub>S</sub>(X − η∇TV)) 으로 찾습니다.
          .ak는 인수를 5비트로 양자화하므로 원본이 S에 정확히 들어가지 않습니다. 그래서 양자화 간격으로 추정한 오차 δ만큼 두께를 준 볼록집합
          {"{"}‖U<sub>k</sub><sup>T</sup>(X − Â<sub>k</sub>)‖ ≤ δ{"}"} ∩ {"{"}‖(X − Â<sub>k</sub>)V<sub>k</sub>‖ ≤ δ{"}"}도 함께 비교합니다.
        </p>
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className="pair" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="cell-head"><span className="label">A (luma)</span><span className="label num">{raster ? `${raster.h}×${raster.w}` : ""}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={src} style={{ width: "100%", height: "auto" }} className={raster ? "" : "hide"} />{!raster && <span className="label">no image</span>}</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--line)" }}>
              <div className="cell-head"><span className="label">Â<sub>k</sub> decoded .ak, k = {d?.k ?? detailK}</span><span className="label num">{d ? `${fixed(d.psnrAk, 2)} dB / ${d.bytes} B` : ""}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={cAk} style={{ width: "100%", height: "auto" }} className={res ? "" : "hide"} /></div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              <div className="cell-head"><span className="label">restored (relaxed set)</span><span className="label num">{d ? `${fixed(d.psnrRestored, 2)} dB` : ""}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={cRe} style={{ width: "100%", height: "auto" }} className={res ? "" : "hide"} /></div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", borderLeft: "1px solid var(--line)" }}>
              <div className="cell-head"><span className="label">matrix completion, same count</span><span className="label num">{d?.psnrCompletion != null ? `${fixed(d.psnrCompletion, 2)} dB` : ""}</span></div>
              <div className="view" style={{ minHeight: 200 }}><canvas ref={cCo} style={{ width: "100%", height: "auto" }} className={res?.detail?.completion ? "" : "hide"} />{res && !res.detail?.completion && <span className="label">off</span>}</div>
            </div>
          </div>

          {res && (
            <>
              <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}><span className="label">PSNR vs k (higher = closer to the original)</span></div>
                <Chart
                  height={280}
                  xLabel="k"
                  yLabel="dB"
                  cursorX={detailK}
                  series={[
                    { name: "Âₖ (decoded)", x: ks, y: res.rows.map((r) => r.psnrAk), width: 1, points: true },
                    { name: "TV on exact set S", x: ks, y: res.rows.map((r) => r.psnrExact), dash: "4 3", points: true },
                    { name: "TV on relaxed set (δ)", x: ks, y: res.rows.map((r) => r.psnrRestored), width: 3, points: true, color: "var(--signal)" },
                    ...(res.rows[0].psnrCompletion != null
                      ? [{ name: "matrix completion, same number of values", x: ks, y: res.rows.map((r) => r.psnrCompletion as number), dash: "1 3", points: true }]
                      : []),
                  ]}
                />
              </div>
              {d && (
                <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
                  <div className="row" style={{ marginBottom: 6 }}><span className="label">PSNR vs iteration, k = {d.k}</span></div>
                  <Chart
                    height={220}
                    xLabel="iteration"
                    yLabel="dB"
                    series={[
                      { name: "exact set S", x: [0, ...d.curveExact.map((c) => c[0])], y: [d.psnrAk, ...d.curveExact.map((c) => c[1])], dash: "4 3" },
                      { name: "relaxed set (δ)", x: [0, ...d.curve.map((c) => c[0])], y: [d.psnrAk, ...d.curve.map((c) => c[1])], width: 3, color: "var(--signal)" },
                    ]}
                  />
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--line)", overflowX: "auto" }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th>k</th>
                      <th>.ak bytes</th>
                      <th>values k(m+n+1)</th>
                      <th>Âₖ dB</th>
                      <th>exact S dB</th>
                      <th>relaxed dB</th>
                      <th>gain</th>
                      <th>completion dB</th>
                      <th>δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.rows.map((r) => (
                      <tr key={r.k} data-hl={r.k === detailK ? "1" : "0"}>
                        <td>{r.k}</td>
                        <td>{r.bytes}</td>
                        <td>{r.stored}</td>
                        <td>{fixed(r.psnrAk, 2)}</td>
                        <td>{fixed(r.psnrExact, 2)}</td>
                        <td>{fixed(r.psnrRestored, 2)}</td>
                        <td>{(r.psnrRestored - r.psnrAk >= 0 ? "+" : "") + fixed(r.psnrRestored - r.psnrAk, 2)}</td>
                        <td>{r.psnrCompletion != null ? fixed(r.psnrCompletion, 2) : "—"}</td>
                        <td>{fixed(r.delta, 0)}</td>
                      </tr>
                    ))}
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
            <div className="ctl-head"><span className="label">ranks</span></div>
            <div className="seg">
              <button data-on={kset === "quick" ? "1" : "0"} onClick={() => setKset("quick")}>8 16 32</button>
              <button data-on={kset === "full" ? "1" : "0"} onClick={() => setKset("full")}>4 … 48</button>
            </div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">show images for k</span></div>
            <div className="seg">{KSETS[kset].map((k) => <button key={k} data-on={detailK === k ? "1" : "0"} onClick={() => setDetailK(k)}>{k}</button>)}</div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">iterations</span><span className="mono">{iters}</span></div>
            <input type="range" min={20} max={400} step={20} value={iters} onChange={(e) => setIters(Number(e.target.value))} />
          </div>
          <div className="ctl">
            <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={completion} onChange={(e) => setCompletion(e.target.checked)} /> compare matrix completion (slow)
            </label>
          </div>
          <div className="ctl stack">
            <button className="btn solid wide" disabled={!raster || !!prog} onClick={run}>{prog ? "Running" : "Run"}</button>
            {prog && <span className="label mono">{prog}</span>}
          </div>
          {res && (
            <div className="ctl">
              <button className="btn ghost wide" onClick={csv}>Export csv</button>
            </div>
          )}
          <div className="ctl">
            <p className="note">
              행렬 완성 비교군: 같은 개수 k(m + n + 1)의 픽셀을 무작위로 골라 남기고(위치는 시드로 정해져 저장 비용 없음), 핵 노름 정규화 soft-impute로 나머지를 채웁니다.
              PSNR은 원본 luma 대비, 값은 0~255로 자른 뒤 계산합니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
