"use client";
import { useState } from "react";
import { addShare, newId, shareLink, storageReady, upload } from "@/lib/store";
import { bytes } from "@/lib/fmt";

type Props = {
  blob: Blob | null;
  kind: "t" | "w" | "m";
  orig: number;
  name: string;
  info: string;
  thumb: () => string;
  disabled?: boolean;
};

export default function ShareBox({ blob, kind, orig, name, info, thumb, disabled }: Props) {
  const [state, setState] = useState<"idle" | "up" | "done" | "err">("idle");
  const [prog, setProg] = useState(0);
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [ms, setMs] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sentFor, setSentFor] = useState<Blob | null>(null);

  const stale = sentFor !== null && sentFor !== blob;

  async function share() {
    if (!blob) return;
    setState("up");
    setProg(0);
    setMsg("");
    setCopied(false);
    const id = newId(kind);
    const t0 = performance.now();
    try {
      const { owned } = await upload(id, blob, setProg);
      setMs(performance.now() - t0);
      addShare({ id, size: blob.size, orig, name, created: Date.now(), thumb: thumb(), owned, info });
      setLink(shareLink(id));
      setSentFor(blob);
      setState("done");
    } catch (e) {
      setMsg((e as Error).message);
      setState("err");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ctl stack">
      <button className="btn solid wide" disabled={!blob || disabled || state === "up" || !storageReady()} onClick={share}>
        {state === "up" ? `Uploading ${Math.round(prog * 100)} %` : state === "done" && !stale ? "Share again" : "Share"}
      </button>
      {state === "up" && <div className="bar"><i style={{ width: `${prog * 100}%` }} /></div>}
      {!storageReady() && <div className="err">storage not configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY</div>}
      {state === "err" && <div className="err">{msg}</div>}
      {state === "done" && (
        <div className="stack">
          <div className="row">
            <span className="label">link {stale ? "(previous settings)" : ""}</span>
            <span className="label num">{blob ? bytes(sentFor?.size ?? 0) : ""} / {ms.toFixed(0)} ms</span>
          </div>
          <input className="field" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <a className="btn ghost" style={{ flex: 1 }} href={link} target="_blank" rel="noreferrer">Open</a>
          </div>
        </div>
      )}
    </div>
  );
}
