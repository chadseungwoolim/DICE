"use client";
import { useEffect, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { fileToBitmap, paint, rasterize, toGray } from "@/lib/image";
import { fixed, sci } from "@/lib/fmt";
import Chart from "@/app/components/Chart";
import FilePick from "@/app/components/FilePick";

const SIZES = [96, 128, 192, 256];
const MODES: { id: string; label: string; needB?: boolean; desc: string }[] = [
  { id: "randU", label: "U ← random", desc: "Ũ = 난수 정규직교 행렬, Σ와 V는 원래 값" },
  { id: "randV", label: "V ← random", desc: "Ṽ = 난수 정규직교 행렬, Σ와 U는 원래 값" },
  { id: "randUV", label: "U, V ← random", desc: "Ũ, Ṽ 모두 난수 정규직교, Σ만 원래 값" },
  { id: "perm", label: "permute pairing", desc: "σᵢ를 다른 순번의 (uⱼ, vⱼ) 쌍과 결합. Σ의 값 집합과 순서는 그대로" },
  { id: "sign", label: "flip signs of uᵢ", desc: "임의의 i에 대해 uᵢ → −uᵢ (V는 그대로)" },
  { id: "swapUV", label: "U, V ← image B", needB: true, desc: "A의 Σ에 B의 U, V를 결합" },
  { id: "swapU", label: "U ← image B", needB: true, desc: "A의 Σ, V에 B의 U를 결합" },
  { id: "swapV", label: "V ← image B", needB: true, desc: "A의 Σ, U에 B의 V를 결합" },
  { id: "sigmaB", label: "control: Σ ← B", needB: true, desc: "대조군: 벡터는 A 그대로, 특이값만 B의 값으로 교체 (Σ가 달라지는 유일한 모드)" },
];

type Run = {
  k: number;
  orig: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  modified: Uint8ClampedArray;
  diff: Uint8ClampedArray;
  sigmaNormal: Float64Array;
  sigmaModified: Float64Array;
  maxSigmaDiff: number;
  sigmaIdentical: boolean;
  froNormal: number;
  froModified: number;
  froSigma: number;
  rmseNormal: number;
  rmseModified: number;
  orthoU: number;
  orthoV: number;
  diffMax: number;
};

export default function Vectors() {
  const core = useRef<Core | null>(null);
  const cv = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const bcv = useRef<HTMLCanvasElement>(null);
  const [fa, setFa] = useState<File | null>(null);
  const [fb, setFb] = useState<File | null>(null);
  const [size, setSize] = useState(128);
  const [ready, setReady] = useState<{ n: number; r: number; hasB: boolean; t: number } | null>(null);
  const [k, setK] = useState(20);
  const [mode, setMode] = useState("randU");
  const [seed, setSeed] = useState(1);
  const [map, setMap] = useState<"clamp" | "minmax">("clamp");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    core.current = new Core();
    return () => core.current?.terminate();
  }, []);

  useEffect(() => {
    if (!fa || !core.current) return;
    let dead = false;
    (async () => {
      try {
        setBusy("svd");
        setErr("");
        setReady(null);
        setRun(null);
        const ra = rasterize((await fileToBitmap(fa)) as ImageBitmap, size, true);
        const a = toGray(ra);
        let b: Float64Array | null = null;
        if (fb) {
          const rb = rasterize((await fileToBitmap(fb)) as ImageBitmap, ra.w, true);
          if (rb.w !== ra.w) throw new Error("image B is smaller than the working size; use a larger image B");
          b = toGray(rb);
          const g = new Uint8ClampedArray(rb.w * rb.h * 4);
          for (let i = 0; i < b.length; i++) { g[4 * i] = g[4 * i + 1] = g[4 * i + 2] = b[i]; g[4 * i + 3] = 255; }
          paint(bcv.current, g, rb.w, rb.h);
        }
        const tr: Transferable[] = [a.buffer];
        if (b) tr.push(b.buffer);
        const out = await core.current!.call("e2prepare", { n: ra.w, a: a.buffer, b: b ? b.buffer : null }, tr);
        if (dead) return;
        setReady(out);
        setK((kk) => Math.min(kk, out.r));
        setBusy("");
      } catch (e) {
        if (!dead) {
          setErr((e as Error).message);
          setBusy("");
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [fa, fb, size]);

  const needB = MODES.find((m) => m.id === mode)?.needB;

  useEffect(() => {
    if (!ready || !core.current) return;
    if (needB && !ready.hasB) return;
    let dead = false;
    core.current
      .call<Run>("e2run", { k, mode, seed, map })
      .then((r) => {
        if (dead) return;
        setRun(r);
        setErr("");
      })
      .catch((e) => !dead && setErr(e.message));
    return () => {
      dead = true;
    };
  }, [ready, k, mode, seed, map, needB]);

  useEffect(() => {
    if (!run || !ready) return;
    const imgs = [run.orig, run.normal, run.modified, run.diff];
    imgs.forEach((im, i) => paint(cv[i].current, im, ready.n, ready.n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ready]);

  const titles = ["A (original)", "Uₖ Σₖ Vₖᵀ", "modified", "|difference|"];
  const m = MODES.find((x) => x.id === mode)!;

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="label mono">E2</div>
          <div className="h1">Singular vectors</div>
        </div>
        <p className="note" style={{ maxWidth: 560 }}>
          같은 Σ<sub>k</sub>를 유지한 채 U 또는 V만 교체해 Ũ Σ<sub>k</sub> Ṽ<sup>T</sup>를 만듭니다. 벡터가 정규직교이면 두 재구성의 Frobenius 노름은 모두 √Σσ²로 같으므로,
          화면의 차이는 &quot;에너지의 양&quot;이 아니라 &quot;에너지가 어디에 배치되는가&quot;에서 나옵니다.
        </p>
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className="pair" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {titles.map((t, i) => (
              <div key={i} style={{ borderLeft: i ? "1px solid var(--line)" : 0 }}>
                <div className="cell-head"><span className="label">{t}</span></div>
                <div className="view" style={{ minHeight: 180, padding: 8 }}>
                  <canvas ref={cv[i]} style={{ width: "100%", height: "auto", imageRendering: "pixelated" }} className={run ? "" : "hide"} />
                  {!run && i === 0 && <span className="label">{busy || "no image"}</span>}
                </div>
              </div>
            ))}
          </div>
          {run && (
            <>
              <div style={{ borderTop: "1px solid var(--line)", padding: "10px 12px" }} className="row">
                <span className="mono">{m.label}</span>
                <span className="note">{m.desc}</span>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--line)" }}>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}>
                  <div className="label">Σ identical</div>
                  <div className={"v" + (run.sigmaIdentical ? "" : " signal")}>{run.sigmaIdentical ? "yes" : "no (control)"}</div>
                </div>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}><div className="label"><span className="m">max |Δσ|</span></div><div className="v">{sci(run.maxSigmaDiff)}</div></div>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}><div className="label">‖UₖΣₖVₖᵀ‖F</div><div className="v">{fixed(run.froNormal, 3)}</div></div>
                <div className="readout"><div className="label">‖ŨΣṼᵀ‖F</div><div className="v">{fixed(run.froModified, 3)}</div></div>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}><div className="label"><span className="m">√Σσ²</span></div><div className="v">{fixed(run.froSigma, 3)}</div></div>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}><div className="label">rmse normal vs A</div><div className="v">{fixed(run.rmseNormal, 2)}</div></div>
                <div className="readout" style={{ borderRight: "1px solid var(--line)" }}><div className="label">rmse modified vs A</div><div className="v">{fixed(run.rmseModified, 2)}</div></div>
                <div className="readout"><div className="label">max|ŨᵀŨ−I| / |ṼᵀṼ−I|</div><div className="v" style={{ fontSize: 13 }}>{sci(run.orthoU, 1)} / {sci(run.orthoV, 1)}</div></div>
              </div>
              <div style={{ padding: 12 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="label"><span className="m">σᵢ</span> used in each reconstruction (log)</span>
                  <span className="label num">diff image max = {fixed(run.diffMax, 2)} (scaled to white)</span>
                </div>
                <Chart
                  height={180}
                  yLog
                  xLabel="i"
                  series={[
                    { name: "normal Σₖ", x: Array.from(run.sigmaNormal, (_, i) => i + 1), y: Array.from(run.sigmaNormal), width: 4, color: "var(--dim)" },
                    { name: "modified", x: Array.from(run.sigmaModified, (_, i) => i + 1), y: Array.from(run.sigmaModified), points: true, line: false },
                  ]}
                />
              </div>
            </>
          )}
          {err && <div className="err" style={{ margin: 12 }}>{err}</div>}
        </div>

        <aside>
          <div className="ctl stack">
            <FilePick label={fa ? `A: ${fa.name}` : "image A"} hint="required" onFiles={(f) => setFa(f[0])} />
            <FilePick label={fb ? `B: ${fb.name}` : "image B"} hint="optional, for swap modes" onFiles={(f) => setFb(f[0])} />
            {fb && <canvas ref={bcv} style={{ width: 64, height: 64, border: "1px solid var(--line)" }} />}
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">matrix n × n (center crop)</span></div>
            <div className="seg">{SIZES.map((s) => <button key={s} data-on={size === s ? "1" : "0"} onClick={() => setSize(s)}>{s}</button>)}</div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">mode</span></div>
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((x) => (
                <option key={x.id} value={x.id} disabled={x.needB && !ready?.hasB}>{x.label}{x.needB && !ready?.hasB ? " (needs B)" : ""}</option>
              ))}
            </select>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">k</span><span className="mono">{k} / {ready?.r ?? "—"}</span></div>
            <input type="range" min={1} max={ready?.r ?? 1} value={k} onChange={(e) => setK(Number(e.target.value))} disabled={!ready} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">seed</span></div>
            <div className="row" style={{ gap: 8 }}>
              <input className="field" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
              <button className="btn ghost" onClick={() => setSeed((s) => s + 1)}>Next</button>
            </div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">display mapping</span></div>
            <div className="seg">
              <button data-on={map === "clamp" ? "1" : "0"} onClick={() => setMap("clamp")}>clamp 0–255</button>
              <button data-on={map === "minmax" ? "1" : "0"} onClick={() => setMap("minmax")}>min–max</button>
            </div>
          </div>
          {ready && <div className="ctl"><span className="label num">svd {ready.t.toFixed(0)} ms (Jacobi)</span></div>}
        </aside>
      </div>
    </div>
  );
}
