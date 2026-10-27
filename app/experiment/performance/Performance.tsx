"use client";
import { useEffect, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { fileToBitmap, rasterize, saveBlob } from "@/lib/image";
import { fixed } from "@/lib/fmt";
import Chart from "@/app/components/Chart";
import FilePick from "@/app/components/FilePick";

type Row = { k: number; kc: number; bytes: number; raw: number; rmse: number; tEnc: number; tDec: number; rmseRestored: number | null; tRestore: number | null };
type One = { name: string; w: number; h: number; tSvd: number; rows: Row[] };

const KSETS: Record<string, number[]> = {
  quick: [4, 8, 16, 32],
  full: [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 48, 64],
};
const RESTORE_KS = [4, 8, 16, 32];

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export default function Performance() {
  const core = useRef<Core | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kset, setKset] = useState<"quick" | "full">("full");
  const [restore, setRestore] = useState(true);
  const [iters, setIters] = useState(120);
  const [res, setRes] = useState<One[]>([]);
  const [prog, setProg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    core.current = new Core();
    return () => core.current?.terminate();
  }, []);

  async function run() {
    if (!files.length || !core.current) return;
    setErr("");
    setRes([]);
    const ks = KSETS[kset];
    const out: One[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProg(`${i + 1}/${files.length} ${f.name}`);
        const r = rasterize((await fileToBitmap(f)) as ImageBitmap, 384); // same size as a sent photo
        const buf = r.rgba.buffer.slice(0) as ArrayBuffer;
        const one = await core.current.call<Omit<One, "name">>(
          "performance",
          { rgba: buf, w: r.w, h: r.h, ks, restoreKs: restore ? RESTORE_KS : [], iters },
          [buf],
          (p) => p.stage === "k" && setProg(`${i + 1}/${files.length} ${f.name}  k ${p.done}/${p.total}`)
        );
        out.push({ name: f.name, ...one });
        setRes([...out]);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setProg("");
  }

  const ks = res.length ? res[0].rows.map((r) => r.k) : [];
  const summary = ks.map((k, j) => {
    const rows = res.map((o) => o.rows[j]);
    const rr = rows.filter((r) => r.rmseRestored != null);
    return {
      k,
      kb: mean(rows.map((r) => r.bytes / 1024)),
      kbMin: Math.min(...rows.map((r) => r.bytes / 1024)),
      kbMax: Math.max(...rows.map((r) => r.bytes / 1024)),
      ratio: mean(rows.map((r) => r.raw / r.bytes)),
      rmse: mean(rows.map((r) => r.rmse)),
      rmseMin: Math.min(...rows.map((r) => r.rmse)),
      rmseMax: Math.max(...rows.map((r) => r.rmse)),
      rest: rr.length ? mean(rr.map((r) => r.rmseRestored as number)) : null,
      better: rr.filter((r) => (r.rmseRestored as number) < r.rmse).length,
      n: rr.length,
      tRestore: rr.length ? mean(rr.map((r) => r.tRestore as number)) : null,
    };
  });

  function csv() {
    const lines = ["image,w,h,k,kc,bytes,raw_bytes,rmse,rmse_restored,ms_svd,ms_encode,ms_decode,ms_restore"];
    for (const o of res)
      for (const r of o.rows)
        lines.push([o.name.replace(/,/g, " "), o.w, o.h, r.k, r.kc, r.bytes, r.raw, r.rmse, r.rmseRestored ?? "", o.tSvd, r.tEnc, r.tDec, r.tRestore ?? ""].join(","));
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `performance_${res.length}images.csv`);
  }

  const withRest = summary.filter((s) => s.rest != null);

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="label mono">E5</div>
          <div className="h1">Performance</div>
        </div>
        <p className="note" style={{ maxWidth: 600 }}>
          여러 장의 사진을 실제 전송과 똑같이(긴 변 384픽셀, 5비트 .ak, 색 성분 계수 k<sub>c</sub> = k/4) 압축하면서 k마다 파일 크기와
          RMSE(원본과의 평균 오차, RGB 0~255 기준)를 잽니다. 복원을 켜면 k = 4, 8, 16, 32에서 &quot;선명하게&quot; 복원 후의 RMSE도 함께 잽니다.
          RMSE는 작을수록 원본에 가깝습니다.
        </p>
      </div>

      <div className="stage">
        <div className="stage-main">
          {!res.length && <div className="view" style={{ minHeight: 240 }}><span className="label">{files.length ? `${files.length} images selected` : "no images"}</span></div>}
          {res.length > 0 && (
            <>
              <div style={{ padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}><span className="label">average RMSE vs average file size ({res.length} images)</span></div>
                <Chart
                  height={280}
                  xLabel="KB"
                  yLabel="RMSE"
                  series={[
                    { name: "compressed (.ak)", x: summary.map((s) => s.kb), y: summary.map((s) => s.rmse), points: true },
                    ...(withRest.length
                      ? [{ name: "restored", x: withRest.map((s) => s.kb), y: withRest.map((s) => s.rest as number), points: true, width: 3, color: "var(--signal)" }]
                      : []),
                  ]}
                  markers={summary.filter((s) => s.k === 16).map((s) => ({ x: s.kb, label: "k = 16" }))}
                />
              </div>
              <div style={{ borderTop: "1px solid var(--line)", overflowX: "auto" }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th>k</th>
                      <th>avg KB</th>
                      <th>min to max KB</th>
                      <th>ratio</th>
                      <th>avg RMSE</th>
                      <th>min to max</th>
                      <th>restored RMSE</th>
                      <th>improved</th>
                      <th>restore ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr key={s.k} data-hl={s.k === 16 ? "1" : "0"}>
                        <td>{s.k}</td>
                        <td>{fixed(s.kb, 2)}</td>
                        <td>{fixed(s.kbMin, 2)} to {fixed(s.kbMax, 2)}</td>
                        <td>{fixed(s.ratio, 0)}</td>
                        <td>{fixed(s.rmse, 2)}</td>
                        <td>{fixed(s.rmseMin, 1)} to {fixed(s.rmseMax, 1)}</td>
                        <td>{s.rest != null ? fixed(s.rest, 2) : "—"}</td>
                        <td>{s.n ? `${s.better}/${s.n}` : "—"}</td>
                        <td>{s.tRestore != null ? fixed(s.tRestore, 0) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ borderTop: "1px solid var(--line)", overflowX: "auto" }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th>image</th>
                      <th>size</th>
                      <th>KB at k = 16</th>
                      <th>RMSE</th>
                      <th>restored</th>
                      <th>svd ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.map((o) => {
                      const r = o.rows.find((x) => x.k === 16) ?? o.rows[Math.floor(o.rows.length / 2)];
                      return (
                        <tr key={o.name}>
                          <td>{o.name}</td>
                          <td>{o.w}×{o.h}</td>
                          <td>{fixed(r.bytes / 1024, 2)}</td>
                          <td>{fixed(r.rmse, 2)}</td>
                          <td>{r.rmseRestored != null ? fixed(r.rmseRestored, 2) : "—"}</td>
                          <td>{fixed(o.tSvd, 0)}</td>
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
            <FilePick multiple label={files.length ? `${files.length} images` : "select images"} hint="several photos" onFiles={(f) => setFiles(f)} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">ranks</span></div>
            <div className="seg">
              <button data-on={kset === "quick" ? "1" : "0"} onClick={() => setKset("quick")}>4 8 16 32</button>
              <button data-on={kset === "full" ? "1" : "0"} onClick={() => setKset("full")}>2 … 64</button>
            </div>
          </div>
          <div className="ctl">
            <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} /> measure restoration (k = 4, 8, 16, 32)
            </label>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">restoration iterations</span><span className="mono">{iters}</span></div>
            <input type="range" min={30} max={240} step={30} value={iters} onChange={(e) => setIters(Number(e.target.value))} />
          </div>
          <div className="ctl stack">
            <button className="btn solid wide" disabled={!files.length || !!prog} onClick={run}>{prog ? "Running" : "Run"}</button>
            {prog && <span className="label mono">{prog}</span>}
          </div>
          {res.length > 0 && !prog && (
            <div className="ctl">
              <button className="btn ghost wide" onClick={csv}>Export csv</button>
            </div>
          )}
          <div className="ctl">
            <p className="note">
              RMSE = √(평균((복원값 − 원본값)²)), R, G, B 세 채널 전체 평균. 압축률(ratio)은 384픽셀 원본의 RGB 바이트 수 ÷ .ak 바이트 수입니다.
              시간은 이 기기에서 잰 값이라 기기마다 다릅니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
