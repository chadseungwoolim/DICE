"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Core, type EncodeResult } from "@/lib/core";
import { dims, fileToBitmap, paint, rasterize, saveBlob, thumbnail } from "@/lib/image";
import { bytes, fixed, pct } from "@/lib/fmt";
import Chart from "./Chart";
import ShareBox from "./ShareBox";

type Info = { r: number; rc: number; s: Float64Array; w: number; h: number; t: number };
type Params = { k: number; kc: number; kcAuto: boolean; bits: number; mono: boolean };

const SIZES = [256, 384, 512, 768];
const PRESETS: { name: string; size: number; p: Params }[] = [
  { name: "min", size: 256, p: { k: 6, kc: 1, kcAuto: true, bits: 4, mono: true } },
  { name: "low", size: 384, p: { k: 12, kc: 3, kcAuto: true, bits: 5, mono: false } },
  { name: "mid", size: 512, p: { k: 32, kc: 8, kcAuto: true, bits: 6, mono: false } },
  { name: "high", size: 768, p: { k: 80, kc: 20, kcAuto: true, bits: 7, mono: false } },
];

export default function ImageCompressor({ file, onReset }: { file: File; onReset: () => void }) {
  const core = useRef<Core | null>(null);
  const bmp = useRef<ImageBitmap | HTMLImageElement | null>(null);
  const outCanvas = useRef<HTMLCanvasElement>(null);
  const [origUrl, setOrigUrl] = useState("");
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState(384);
  const [p, setP] = useState<Params>({ k: 12, kc: 3, kcAuto: true, bits: 5, mono: false });
  const [info, setInfo] = useState<Info | null>(null);
  const [res, setRes] = useState<EncodeResult | null>(null);
  const [stage, setStage] = useState("decoding");
  const [err, setErr] = useState("");
  const [encMs, setEncMs] = useState(0);
  const loadKey = useRef("");
  const busy = useRef(false);
  const want = useRef<Params | null>(null);

  const kc = p.kcAuto ? Math.max(1, Math.ceil(p.k / 4)) : p.kc;

  useEffect(() => {
    core.current = new Core();
    const u = URL.createObjectURL(file);
    setOrigUrl(u);
    return () => {
      core.current?.terminate();
      URL.revokeObjectURL(u);
    };
  }, [file]);

  // decode + decompose whenever the working size changes
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setErr("");
        setStage("decoding");
        if (!bmp.current) {
          bmp.current = await fileToBitmap(file);
          setOrigDims(dims(bmp.current));
        }
        const r = rasterize(bmp.current as ImageBitmap, size);
        setStage(`svd ${r.w}×${r.h}`);
        const key = `${size}`;
        const buf = r.rgba.buffer.slice(0) as ArrayBuffer;
        const out = await core.current!.call<Info>("load", { key, rgba: buf, w: r.w, h: r.h }, [buf]);
        if (dead) return;
        loadKey.current = key;
        setInfo(out);
        setStage("");
      } catch (e) {
        if (!dead) setErr(`decode failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      dead = true;
    };
  }, [file, size]);

  const run = useCallback(async () => {
    if (busy.current || !want.current || !core.current || !loadKey.current) return;
    const q = want.current;
    want.current = null;
    busy.current = true;
    const t0 = performance.now();
    try {
      const kcv = q.kcAuto ? Math.max(1, Math.ceil(q.k / 4)) : q.kc;
      const r = await core.current.call<EncodeResult>("encode", { key: loadKey.current, k: q.k, kc: kcv, bits: q.bits, mono: q.mono });
      setEncMs(performance.now() - t0);
      setRes(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      busy.current = false;
      if (want.current) run();
    }
  }, []);

  useEffect(() => {
    if (!info) return;
    want.current = { ...p, k: Math.min(p.k, info.r), kc: Math.min(p.kc, info.rc) };
    run();
  }, [p, info, run]);

  useEffect(() => {
    if (res && outCanvas.current) paint(outCanvas.current, res.rgba, res.w, res.h);
  }, [res]);

  const blob = useMemo(() => (res ? new Blob([res.bytes as BlobPart], { type: "application/octet-stream" }) : null), [res]);
  const set = (q: Partial<Params>) => setP((o) => ({ ...o, ...q }));
  const reduction = res ? 1 - res.bytes.length / file.size : 0;
  const base = file.name.replace(/\.[^.]+$/, "");

  const spectrum = useMemo(() => {
    if (!info) return null;
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < info.r; i++) {
      x.push(i + 1);
      y.push(info.s[i]);
    }
    return { x, y };
  }, [info]);

  return (
    <div className="stage">
      <div className="stage-main">
        <div className="pair">
          <div>
            <div className="cell-head">
              <span className="label">original</span>
              <span className="label num">{origDims.w}×{origDims.h} / {bytes(file.size)}</span>
            </div>
            <div className="view">{origUrl && <img src={origUrl} alt="original" className="fit" />}</div>
          </div>
          <div>
            <div className="cell-head">
              <span className="label">A<sub>k</sub> decoded from .ak</span>
              <span className="label num">
                {res ? `${res.w}×${res.h} / ${bytes(res.bytes.length)}` : ""}
              </span>
            </div>
            <div className="view">
              <canvas ref={outCanvas} className={res ? "fit" : "hide"} />
              {!res && <span className="label">{err ? "" : stage || "encoding"}</span>}
            </div>
          </div>
        </div>
        {spectrum && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "12px 12px 10px" }}>
            <div className="row" style={{ marginBottom: 4 }}>
              <span className="label">singular values <span className="m">σ</span><sub>i</sub> of luma Y (log)</span>
              <span className="label num">r = {info!.r} / svd {info!.t.toFixed(0)} ms</span>
            </div>
            <Chart series={[{ name: "", x: spectrum.x, y: spectrum.y }]} yLog height={170} cursorX={Math.min(p.k, info!.r)} xLabel="i" />
          </div>
        )}
        {err && <div className="err" style={{ margin: 12 }}>{err}</div>}
      </div>

      <aside>
        <div className="ctl">
          <div className="ctl-head">
            <span className="label">file</span>
            <button className="btn ghost" style={{ height: 22, padding: "0 8px", fontSize: 9 }} onClick={onReset}>New</button>
          </div>
          <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">preset</span></div>
          <div className="seg">
            {PRESETS.map((pr) => (
              <button key={pr.name} onClick={() => { setSize(pr.size); setP(pr.p); }}>{pr.name}</button>
            ))}
          </div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">working size (max side)</span></div>
          <div className="seg">
            {SIZES.map((s) => (
              <button key={s} data-on={size === s ? "1" : "0"} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">channels</span></div>
          <div className="seg">
            <button data-on={!p.mono ? "1" : "0"} onClick={() => set({ mono: false })}>color YCbCr</button>
            <button data-on={p.mono ? "1" : "0"} onClick={() => set({ mono: true })}>mono Y</button>
          </div>
        </div>
        <div className="ctl">
          <div className="ctl-head">
            <span className="label">rank k</span>
            <input className="field" style={{ width: 70, height: 24 }} type="number" min={1} max={info?.r ?? 1} value={p.k}
              onChange={(e) => set({ k: Math.max(1, Math.min(info?.r ?? 1, Number(e.target.value) || 1)) })} />
          </div>
          <input type="range" min={1} max={Math.max(1, Math.min(info?.r ?? 1, 200))} value={Math.min(p.k, 200)} onChange={(e) => set({ k: Number(e.target.value) })} />
        </div>
        {!p.mono && (
          <div className="ctl">
            <div className="ctl-head">
              <span className="label">chroma rank k<sub>c</sub></span>
              <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={p.kcAuto} onChange={(e) => set({ kcAuto: e.target.checked, kc })} /> auto ⌈k/4⌉
              </label>
            </div>
            <div className="row">
              <input type="range" min={1} max={Math.max(1, Math.min(info?.rc ?? 1, 100))} value={kc} disabled={p.kcAuto}
                onChange={(e) => set({ kc: Number(e.target.value), kcAuto: false })} />
              <span className="mono" style={{ width: 34, textAlign: "right" }}>{kc}</span>
            </div>
          </div>
        )}
        <div className="ctl">
          <div className="ctl-head">
            <span className="label">quantization bits</span>
            <span className="mono">{p.bits}</span>
          </div>
          <input type="range" min={3} max={7} value={p.bits} onChange={(e) => set({ bits: Number(e.target.value) })} />
        </div>

        <div className="readouts">
          <div className="readout"><div className="label">original</div><div className="v">{bytes(file.size)}</div></div>
          <div className="readout"><div className="label">compressed</div><div className="v">{res ? bytes(res.bytes.length) : "—"}</div></div>
          <div className="readout"><div className="label">reduction</div><div className="v">{res ? pct(reduction) : "—"}</div></div>
          <div className="readout"><div className="label">ratio</div><div className="v">{res ? `${fixed(file.size / res.bytes.length, 1)} : 1` : "—"}</div></div>
          <div className="readout"><div className="label">rank</div><div className="v">{res ? (res.mono ? `k=${res.k}` : `k=${res.k} / ${res.kc}`) : "—"}</div></div>
          <div className="readout"><div className="label">params</div><div className="v">{res ? res.params.toLocaleString() : "—"}</div></div>
          <div className="readout"><div className="label">rmse</div><div className="v">{res ? fixed(res.rmse, 2) : "—"}</div></div>
          <div className="readout"><div className="label">psnr</div><div className="v">{res ? fixed(res.psnr, 2) : "—"}<span className="u">dB</span></div></div>
          <div className="readout"><div className="label">energy <span className="m">Σσ²</span></div><div className="v">{res ? pct(res.energy, 3) : "—"}</div></div>
          <div className="readout"><div className="label">raw bitmap</div><div className="v">{res ? bytes(res.rawBytes) : "—"}</div></div>
        </div>
        <div className="ctl">
          <span className="note">
            {res
              ? `${res.mono ? "RMSE vs luma" : "RMSE vs RGB"} at working size. Preview is decoded from the exact ${res.bytes.length} bytes that will be uploaded. encode ${encMs.toFixed(0)} ms.`
              : ""}
          </span>
        </div>
        <ShareBox
          blob={blob}
          kind="t"
          orig={file.size}
          name={file.name}
          info={res ? `${res.w}×${res.h} k=${res.k}${res.mono ? " mono" : `/${res.kc}`} ${res.bits}b` : ""}
          thumb={() => (outCanvas.current && res ? thumbnail(outCanvas.current, res.w, res.h) : "")}
        />
        <div className="ctl row" style={{ gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }} disabled={!blob} onClick={() => blob && saveBlob(blob, `${base}.k${res?.k}.ak`)}>.ak</button>
          <button className="btn ghost" style={{ flex: 1 }} disabled={!res} onClick={() => outCanvas.current?.toBlob((b) => b && saveBlob(b, `${base}.k${res?.k}.png`), "image/png")}>png</button>
        </div>
      </aside>
    </div>
  );
}
