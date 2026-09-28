"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { bytes, fixed, pct } from "@/lib/fmt";
import { saveBlob } from "@/lib/image";
import ShareBox from "./ShareBox";
import fixWebmDuration from "fix-webm-duration";

const HEIGHTS = [96, 144, 240, 360];
const FPS = [6, 10, 15, 24];
const LIMITS = [0, 5, 10, 30];
const CODECS = [
  { label: "VP9 / WebM", base: "video/webm;codecs=vp9", audio: "opus" },
  { label: "AV1 / WebM", base: "video/webm;codecs=av01", audio: "opus" },
  { label: "VP8 / WebM", base: "video/webm;codecs=vp8", audio: "opus" },
  { label: "H.264 / MP4", base: "video/mp4;codecs=avc1.42E01E", audio: "mp4a.40.2" },
  { label: "MP4 (default)", base: "video/mp4", audio: "" },
  { label: "WebM (default)", base: "video/webm", audio: "" },
];

type Opt = { height: number; fps: number; kbps: number; audio: boolean; akbps: number; mono: boolean; codec: number; limit: number };
type Out = { blob: Blob; mime: string; w: number; h: number; fps: number; dur: number; ms: number };

function mimeFor(c: (typeof CODECS)[number], audio: boolean) {
  if (!audio || !c.audio) return c.base;
  return c.base.includes("codecs=") ? `${c.base},${c.audio}` : c.base;
}

export default function VideoCompressor({ file, onReset }: { file: File; onReset: () => void }) {
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<{ w: number; h: number; dur: number } | null>(null);
  const [supported, setSupported] = useState<number[]>([]);
  const [o, setO] = useState<Opt>({ height: 144, fps: 10, kbps: 60, audio: false, akbps: 16, mono: false, codec: 0, limit: 0 });
  const [prog, setProg] = useState(0);
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<Out | null>(null);
  const [outUrl, setOutUrl] = useState("");
  const [err, setErr] = useState("");
  const thumbRef = useRef("");
  const abort = useRef(false);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = u;
    v.onloadedmetadata = () => setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
    v.onerror = () => setErr("this browser cannot decode the video");
    const ok: number[] = [];
    if (typeof MediaRecorder !== "undefined") {
      CODECS.forEach((c, i) => {
        try {
          if (MediaRecorder.isTypeSupported(c.base)) ok.push(i);
        } catch {}
      });
    }
    setSupported(ok);
    if (ok.length) setO((q) => ({ ...q, codec: ok[0] }));
    else setErr("MediaRecorder is not available in this browser");
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);

  const dur = meta ? (o.limit ? Math.min(o.limit, meta.dur) : meta.dur) : 0;
  const estimate = dur * ((o.kbps + (o.audio ? o.akbps : 0)) * 1000) / 8;
  const outH = meta ? Math.min(o.height, meta.h) : o.height;
  const outW = meta ? Math.max(2, Math.round((meta.w * outH) / meta.h / 2) * 2) : 0;

  async function encode() {
    if (!meta || running) return;
    setErr("");
    setOut(null);
    setRunning(true);
    setProg(0);
    abort.current = false;
    const t0 = performance.now();
    const actx = o.audio ? new AudioContext() : null;
    const v = document.createElement("video");
    v.src = url;
    v.playsInline = true;
    v.muted = !o.audio;
    v.preload = "auto";
    try {
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("video decode error"));
      });
      const H = Math.max(2, Math.floor(outH / 2) * 2), W = outW;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      const stream = c.captureStream(o.fps);
      if (actx) {
        try {
          const src = actx.createMediaElementSource(v);
          const dest = actx.createMediaStreamDestination();
          src.connect(dest);
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
          await actx.resume();
        } catch {
          /* audio unavailable: continue without */
        }
      }
      const codec = CODECS[o.codec];
      let mime = mimeFor(codec, stream.getAudioTracks().length > 0);
      if (!MediaRecorder.isTypeSupported(mime)) mime = codec.base;
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: o.kbps * 1000,
        audioBitsPerSecond: stream.getAudioTracks().length ? o.akbps * 1000 : undefined,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
      const step = 1 / o.fps;
      let last = -Infinity, first = true, finished = false;
      const draw = () => {
        ctx.filter = o.mono ? "grayscale(1)" : "none";
        ctx.drawImage(v, 0, 0, W, H);
        if (first) {
          first = false;
          const tc = document.createElement("canvas");
          const s = 64 / Math.max(W, H);
          tc.width = Math.max(1, Math.round(W * s));
          tc.height = Math.max(1, Math.round(H * s));
          tc.getContext("2d")!.drawImage(c, 0, 0, tc.width, tc.height);
          thumbRef.current = tc.toDataURL("image/jpeg", 0.5);
        }
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        v.pause();
        if (rec.state !== "inactive") rec.stop();
      };
      const tick = (t: number) => {
        if (finished) return;
        if (t - last >= step - 1e-3) {
          draw();
          last = t;
        }
        setProg(Math.min(1, t / dur));
        if (t >= dur || abort.current) finish();
      };
      const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
      if (hasRVFC) {
        const loop = (_: number, md: VideoFrameCallbackMetadata) => {
          tick(md.mediaTime);
          if (!finished) (v as any).requestVideoFrameCallback(loop);
        };
        (v as any).requestVideoFrameCallback(loop);
      } else {
        const loop = () => {
          tick(v.currentTime);
          if (!finished) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
      v.onended = finish;
      v.currentTime = 0;
      draw();
      rec.start(500);
      await v.play();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      if (abort.current) throw new Error("aborted");
      const type = (rec.mimeType || mime).split(";")[0];
      const encodedDur = Math.min(v.currentTime, dur);
      let blob = new Blob(chunks, { type });
      if (type === "video/webm") {
        // MediaRecorder WebM has no duration element; write it so players can seek
        blob = await fixWebmDuration(blob, encodedDur * 1000, { logger: false });
      }
      setOut({ blob, mime: rec.mimeType || mime, w: W, h: H, fps: o.fps, dur: encodedDur, ms: performance.now() - t0 });
      setOutUrl(URL.createObjectURL(blob));
      setProg(1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      actx?.close().catch(() => {});
      v.removeAttribute("src");
      v.load();
      setRunning(false);
    }
  }

  const set = (q: Partial<Opt>) => setO((x) => ({ ...x, ...q }));
  const kind: "w" | "m" = out && out.blob.type.includes("mp4") ? "m" : "w";
  const ext = kind === "m" ? "mp4" : "webm";
  const base = file.name.replace(/\.[^.]+$/, "");
  const reduction = out ? 1 - out.blob.size / file.size : 0;
  const info = useMemo(() => (out ? `${out.w}×${out.h} ${out.fps}fps ${o.kbps}kbps ${fixed(out.dur, 1)}s` : ""), [out, o.kbps]);

  return (
    <div className="stage">
      <div className="stage-main">
        <div className="pair">
          <div>
            <div className="cell-head">
              <span className="label">original</span>
              <span className="label num">{meta ? `${meta.w}×${meta.h} / ${fixed(meta.dur, 1)} s / ` : ""}{bytes(file.size)}</span>
            </div>
            <div className="view">{url && <video src={url} controls muted playsInline className="fit" />}</div>
          </div>
          <div>
            <div className="cell-head">
              <span className="label">re-encoded</span>
              <span className="label num">{out ? `${out.w}×${out.h} / ${bytes(out.blob.size)}` : ""}</span>
            </div>
            <div className="view">
              {outUrl ? (
                <video src={outUrl} controls playsInline loop className="fit" />
              ) : (
                <span className="label">{running ? `encoding ${Math.round(prog * 100)} %` : "not encoded"}</span>
              )}
            </div>
          </div>
        </div>
        {running && <div className="bar"><i style={{ width: `${prog * 100}%` }} /></div>}
        <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
          <p className="note">
            인코딩은 브라우저의 MediaRecorder로 실시간 재생하며 수행됩니다 (소요 시간 ≈ 영상 길이). 탭을 화면에 띄워 둔 상태로 두세요.
            비트레이트는 인코더 목표값이며 실제 크기는 완료 후 측정값으로 표시됩니다.
          </p>
        </div>
        {err && <div className="err" style={{ margin: 12 }}>{err}</div>}
      </div>

      <aside>
        <div className="ctl">
          <div className="ctl-head">
            <span className="label">file</span>
            <button className="btn ghost" style={{ height: 22, padding: "0 8px", fontSize: 9 }} onClick={onReset} disabled={running}>New</button>
          </div>
          <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">height (px)</span><span className="mono">{outW}×{Math.floor(outH / 2) * 2}</span></div>
          <div className="seg">{HEIGHTS.map((h) => <button key={h} data-on={o.height === h ? "1" : "0"} onClick={() => set({ height: h })}>{h}</button>)}</div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">frame rate</span></div>
          <div className="seg">{FPS.map((f) => <button key={f} data-on={o.fps === f ? "1" : "0"} onClick={() => set({ fps: f })}>{f}</button>)}</div>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">video bitrate</span><span className="mono">{o.kbps} kbps</span></div>
          <input type="range" min={16} max={800} step={4} value={o.kbps} onChange={(e) => set({ kbps: Number(e.target.value) })} />
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">codec</span></div>
          <select className="field" value={o.codec} onChange={(e) => set({ codec: Number(e.target.value) })}>
            {supported.map((i) => <option key={i} value={i}>{CODECS[i].label}</option>)}
          </select>
        </div>
        <div className="ctl">
          <div className="ctl-head"><span className="label">duration</span></div>
          <div className="seg">{LIMITS.map((l) => <button key={l} data-on={o.limit === l ? "1" : "0"} onClick={() => set({ limit: l })}>{l ? `${l}s` : "full"}</button>)}</div>
        </div>
        <div className="ctl">
          <div className="row">
            <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={o.audio} onChange={(e) => set({ audio: e.target.checked })} /> audio
            </label>
            {o.audio && (
              <select className="field" style={{ width: 100, height: 24 }} value={o.akbps} onChange={(e) => set({ akbps: Number(e.target.value) })}>
                {[12, 16, 24, 32, 48].map((a) => <option key={a} value={a}>{a} kbps</option>)}
              </select>
            )}
            <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={o.mono} onChange={(e) => set({ mono: e.target.checked })} /> mono
            </label>
          </div>
        </div>
        <div className="ctl stack">
          <div className="row"><span className="label">target estimate</span><span className="mono">{bytes(Math.round(estimate))}</span></div>
          {!running ? (
            <button className="btn wide" disabled={!meta || !supported.length} onClick={encode}>Encode</button>
          ) : (
            <button className="btn wide" onClick={() => (abort.current = true)}>Abort {Math.round(prog * 100)} %</button>
          )}
        </div>
        <div className="readouts">
          <div className="readout"><div className="label">original</div><div className="v">{bytes(file.size)}</div></div>
          <div className="readout"><div className="label">compressed</div><div className="v">{out ? bytes(out.blob.size) : "—"}</div></div>
          <div className="readout"><div className="label">reduction</div><div className="v">{out ? pct(reduction) : "—"}</div></div>
          <div className="readout"><div className="label">ratio</div><div className="v">{out ? `${fixed(file.size / out.blob.size, 1)} : 1` : "—"}</div></div>
          <div className="readout"><div className="label">actual rate</div><div className="v">{out && out.dur > 0 ? `${fixed((out.blob.size * 8) / out.dur / 1000, 1)}` : "—"}<span className="u">kbps</span></div></div>
          <div className="readout"><div className="label">format</div><div className="v" style={{ fontSize: 12 }}>{out ? out.mime : "—"}</div></div>
        </div>
        <ShareBox blob={out?.blob ?? null} kind={kind} orig={file.size} name={file.name} info={info} thumb={() => thumbRef.current} disabled={running} />
        <div className="ctl">
          <button className="btn ghost wide" disabled={!out} onClick={() => out && saveBlob(out.blob, `${base}.${outH}p.${ext}`)}>.{ext}</button>
        </div>
      </aside>
    </div>
  );
}
