"use client";
import { useEffect, useState } from "react";
import { listShares, remove, saveShares, shareLink, storageReady, type ShareRec } from "@/lib/store";
import { bytes, pct } from "@/lib/fmt";

export default function ShareList() {
  const [items, setItems] = useState<ShareRec[]>([]);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [open, setOpen] = useState("");

  useEffect(() => setItems(listShares()), []);

  const total = items.reduce((a, b) => a + b.size, 0);
  const totalOrig = items.reduce((a, b) => a + b.orig, 0);

  function forget(id: string) {
    const v = items.filter((x) => x.id !== id);
    setItems(v);
    saveShares(v);
  }
  async function del(id: string) {
    setMsg("");
    try {
      await remove(id);
      forget(id);
      setMsg(`deleted ${id}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(shareLink(id));
      setCopied(id);
    } catch {}
  }
  function go() {
    const m = open.trim().match(/([twm][A-Za-z0-9]{10})\s*$/);
    if (m) window.location.href = `/v/${m[1]}`;
    else setMsg("not a valid link or id");
  }

  return (
    <>
      <div className="section-head">
        <div className="h1">Share</div>
        <div className="row" style={{ gap: 24 }}>
          <span className="label num">{items.length} links</span>
          <span className="label num">sent {bytes(total)}</span>
          <span className="label num">originals {bytes(totalOrig)}</span>
          {totalOrig > 0 && <span className="label num">saved {pct(1 - total / totalOrig, 1)}</span>}
        </div>
      </div>
      <div className="row" style={{ padding: "14px 0", gap: 8, borderBottom: "1px solid var(--line)" }}>
        <input className="field" placeholder="paste a link or id to open" value={open} onChange={(e) => setOpen(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <button className="btn" onClick={go}>Open</button>
      </div>
      {msg && <div className="err" style={{ marginTop: 12 }}>{msg}</div>}
      {!storageReady() && <div className="err" style={{ marginTop: 12 }}>storage not configured</div>}
      {items.length === 0 ? (
        <p className="note" style={{ padding: "40px 0" }}>이 브라우저에서 만든 공유 링크가 없습니다. COMPRESS에서 파일을 압축한 뒤 SHARE를 누르면 여기에 기록됩니다.</p>
      ) : (
        <div style={{ overflowX: "auto", margin: "16px 0 32px" }}>
          <table className="t">
            <thead>
              <tr>
                <th></th>
                <th style={{ textAlign: "left" }}>id</th>
                <th style={{ textAlign: "left" }}>source</th>
                <th style={{ textAlign: "left" }}>params</th>
                <th>size</th>
                <th>original</th>
                <th>reduction</th>
                <th>created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td style={{ width: 56 }}>
                    {s.thumb ? <img src={s.thumb} alt="" style={{ width: 48, height: 36, objectFit: "cover", border: "1px solid var(--line)" }} /> : null}
                  </td>
                  <td style={{ textAlign: "left" }}><a href={`/v/${s.id}`}>{s.id}</a></td>
                  <td style={{ textAlign: "left", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</td>
                  <td style={{ textAlign: "left" }}>{s.info}</td>
                  <td>{bytes(s.size)}</td>
                  <td>{bytes(s.orig)}</td>
                  <td>{pct(1 - s.size / s.orig, 2)}</td>
                  <td>{new Date(s.created).toLocaleString()}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 9 }} onClick={() => copy(s.id)}>{copied === s.id ? "copied" : "copy"}</button>
                      {s.owned && <button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 9 }} onClick={() => del(s.id)}>delete</button>}
                      <button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 9 }} onClick={() => forget(s.id)} title="remove from this list only">forget</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 10 }}>delete: 서버에서 파일 삭제 (업로드한 브라우저만 가능). forget: 이 목록에서만 제거, 링크는 유지됩니다.</p>
        </div>
      )}
    </>
  );
}
