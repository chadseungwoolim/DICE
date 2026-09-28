"use client";
import { useEffect, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { paint, saveBlob } from "@/lib/image";
import { bytes } from "@/lib/fmt";

type Info = { w: number; h: number; nch: number; bits: number; ranks: number[] };

export default function Viewer({ id, src }: { id: string; src: string }) {
  const isImage = id[0] === "t";
  const ext = id[0] === "t" ? "ak" : id[0] === "w" ? "webm" : "mp4";
  const canvas = useRef<HTMLCanvasElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [t, setT] = useState({ fetch: 0, decode: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    let core: Core | null = null;
    let url = "";
    (async () => {
      try {
        const t0 = performance.now();
        const res = await fetch(src, { mode: "cors" });
        if (!res.ok) throw new Error(res.status === 400 || res.status === 404 ? "not found" : `HTTP ${res.status}`);
        const b = await res.blob();
        const t1 = performance.now();
        if (dead) return;
        setBlob(b);
        if (isImage) {
          core = new Core();
          const buf = await b.arrayBuffer();
          const out = await core.call<{ rgba: Uint8ClampedArray; info: Info }>("decode", { bytes: buf }, [buf]);
          if (dead) return;
          paint(canvas.current, out.rgba, out.info.w, out.info.h);
          setInfo(out.info);
          setT({ fetch: t1 - t0, decode: performance.now() - t1 });
        } else {
          url = URL.createObjectURL(b);
          setVideoUrl(url);
          setT({ fetch: t1 - t0, decode: 0 });
        }
      } catch (e) {
        if (!dead) setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
      core?.terminate();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, isImage]);

  return (
    <div className="wrap">
      <div className="section-head">
        <span className="mono">/{id}</span>
        <span className="label num">
          {blob ? bytes(blob.size) : ""}
          {blob ? ` / fetch ${t.fetch.toFixed(0)} ms` : ""}
          {info ? ` / decode ${t.decode.toFixed(0)} ms` : ""}
        </span>
      </div>
      <div className="view" style={{ minHeight: "56vh", margin: "16px 0", border: "1px solid var(--line)" }}>
        {err ? (
          <div className="err">{err}</div>
        ) : isImage ? (
          <canvas ref={canvas} style={{ width: "100%", height: "70vh", objectFit: "contain" }} />
        ) : videoUrl ? (
          <video src={videoUrl} controls autoPlay muted loop playsInline style={{ width: "100%", height: "70vh", objectFit: "contain" }} />
        ) : (
          <span className="label">loading</span>
        )}
      </div>
      <div className="row" style={{ paddingBottom: 28, flexWrap: "wrap" }}>
        <dl className="kv">
          <dt>type</dt>
          <dd>{isImage ? "rank-k SVD image (.ak)" : blob?.type || ext}</dd>
          {info && (
            <>
              <dt>size</dt>
              <dd>{info.w}×{info.h}</dd>
              <dt>rank</dt>
              <dd>{info.nch === 1 ? `k=${info.ranks[0]} (luma)` : `k=${info.ranks[0]} / chroma ${info.ranks[1]}`}</dd>
              <dt>bits</dt>
              <dd>{info.bits}</dd>
            </>
          )}
        </dl>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={!blob} onClick={() => blob && saveBlob(blob, `${id}.${ext}`)}>Download .{ext}</button>
          {isImage && (
            <button className="btn ghost" disabled={!info} onClick={() => canvas.current?.toBlob((b) => b && saveBlob(b, `${id}.png`), "image/png")}>
              Save png
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
