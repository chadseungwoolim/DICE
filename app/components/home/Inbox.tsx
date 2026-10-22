"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { block, deleteMessage, errText, fetchFile, listMessages, markRead, type Msg } from "@/lib/account";
import { decodeBytes, restoreBytes, type Pixels } from "@/lib/media";
import { bytes as fmtBytes } from "@/lib/fmt";
import { saveBlob } from "@/lib/image";
import PixelView from "./PixelView";
import { useBackClose } from "@/lib/back";

const decoded = new Map<string, Promise<Pixels>>();
function pixelsOf(m: Msg): Promise<Pixels> {
  let p = decoded.get(m.path);
  if (!p) {
    p = fetchFile(m.path).then((b) => decodeBytes(m.kind, b));
    p.catch(() => decoded.delete(m.path));
    decoded.set(m.path, p);
  }
  return p;
}

const restoredCache = new Map<string, Pixels>();

function when(iso: string): string {
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function Thumb({ m }: { m: Msg }) {
  const [p, setP] = useState<Pixels | null>(null);
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    const el = ref.current;
    if (!el) return;
    const go = () => pixelsOf(m).then((x) => !dead && setP(x)).catch(() => !dead && setBad(true));
    if (typeof IntersectionObserver === "undefined") {
      go();
      return () => { dead = true; };
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => {
      dead = true;
      io.disconnect();
    };
  }, [m]);
  return (
    <div className="thumb" ref={ref}>
      {p ? <PixelView p={p} still className="thumb-canvas" /> : <span className="label">{bad ? "열 수 없음" : ""}</span>}
      {m.kind === "video" && <span className="badge">영상</span>}
    </div>
  );
}

function Viewer({ m, me, onClose, onReply, onChanged }: { m: Msg; me: string; onClose: () => void; onReply: (n: string) => void; onChanged: () => void }) {
  const self = m.other === me;
  const [p, setP] = useState<Pixels | null>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState<"" | "delete" | "block">("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState<Pixels | null>(restoredCache.get(m.path) || null);
  const [showRestored, setShowRestored] = useState(false);
  const [rprog, setRprog] = useState<number | null>(null);
  useBackClose(onClose);

  async function sharpen() {
    if (restored) {
      setShowRestored((x) => !x);
      return;
    }
    setRprog(0);
    setErr("");
    try {
      const r = await restoreBytes(await fetchFile(m.path), (f) => setRprog(f));
      restoredCache.set(m.path, r);
      setRestored(r);
      setShowRestored(true);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setRprog(null);
    }
  }
  const shown = showRestored && restored ? restored : p;
  useEffect(() => {
    let dead = false;
    pixelsOf(m).then((x) => !dead && setP(x)).catch((e) => !dead && setErr(errText(e)));
    if (m.box === "in" && !m.read_at) markRead(m.id).then(onChanged).catch(() => {});
    return () => { dead = true; };
  }, [m, onChanged]);

  async function save() {
    if (!shown || shown.kind !== "image") return;
    const c = document.createElement("canvas");
    c.width = shown.w;
    c.height = shown.h;
    c.getContext("2d")!.putImageData(new ImageData(shown.rgba.slice(), shown.w, shown.h), 0, 0);
    c.toBlob((b) => b && saveBlob(b, `ak-${m.other}-${m.id.slice(0, 8)}${showRestored ? "-restored" : ""}.png`), "image/png");
  }
  async function act() {
    setBusy(true);
    setErr("");
    try {
      if (confirm === "delete") await deleteMessage(m);
      if (confirm === "block") await block(m.other);
      onChanged();
      onClose();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
      setConfirm("");
    }
  }
  const meta = m.meta as Record<string, number>;
  return (
    <div className="sheet viewer" role="dialog" aria-label="보기">
      <div className="sheet-head">
        <span className="label">
          {self ? "나에게 보낸 것" : m.box === "in" ? `${m.other}에게서` : `${m.other}에게`} / {when(m.created_at)}
        </span>
        <button className="x" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="viewer-stage">
        {shown ? <PixelView p={shown} className="viewer-canvas" /> : <span className="label">{err || "여는 중"}</span>}
        {showRestored && restored && <span className="viewer-tag">추정 복원 (원본 아님)</span>}
        {rprog !== null && (
          <span className="viewer-tag">
            복원 중 {Math.round(rprog * 100)}%
          </span>
        )}
      </div>
      <div className="viewer-info num">
        {fmtBytes(m.bytes)}
        {m.kind === "image" && meta.k ? ` / ${meta.w}×${meta.h} k=${meta.k}` : ""}
        {m.kind === "video" && meta.frames ? ` / ${meta.w}×${meta.h} ${meta.frames}프레임 ${meta.dur ?? ""}초` : ""}
        {meta.orig ? ` / 원본 ${fmtBytes(meta.orig)}` : ""}
      </div>
      {err && p && <div className="err">{err}</div>}
      {confirm ? (
        <div className="viewer-actions">
          <span className="note" style={{ flex: 2 }}>
            {confirm === "delete" ? "양쪽 모두에서 지워집니다." : `${m.other} 번호가 더 이상 나에게 보내지 못합니다. 설정에서 풀 수 있습니다.`}
          </span>
          <button className="btn ghost" onClick={() => setConfirm("")} disabled={busy}>
            취소
          </button>
          <button className="btn solid" onClick={act} disabled={busy}>
            {confirm === "delete" ? "삭제" : "차단"}
          </button>
        </div>
      ) : (
        <div className="viewer-actions">
          <button className="btn solid" onClick={() => onReply(m.other)}>
            {m.box === "in" && !self ? "답장" : "또 보내기"}
          </button>
          {m.kind === "image" && (
            <button className="btn ghost" onClick={sharpen} disabled={!p || rprog !== null}>
              {rprog !== null ? "복원 중" : showRestored ? "압축본 보기" : "선명하게"}
            </button>
          )}
          {m.kind === "image" && (
            <button className="btn ghost" onClick={save} disabled={!p}>
              저장
            </button>
          )}
          <button className="btn ghost" onClick={() => setConfirm("delete")}>
            삭제
          </button>
          {m.box === "in" && !self && (
            <button className="btn ghost" onClick={() => setConfirm("block")}>
              차단
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Inbox({ myNumber, refreshKey, onReply }: { myNumber: string; refreshKey: number; onReply: (n: string) => void }) {
  const [box, setBox] = useState<"in" | "out">("in");
  const [list, setList] = useState<Msg[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Msg | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listMessages("all"));
      setErr("");
    } catch (e) {
      setErr(errText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // poll while the page is visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  const shown = (list || []).filter((m) => m.box === box || (m.other === myNumber && box === "in"));
  const unread = (list || []).filter((m) => m.box === "in" && !m.read_at).length;

  return (
    <div className="inbox">
      <div className="inbox-bar">
        <div className="seg inbox-seg">
          <button data-on={box === "in" ? "1" : "0"} onClick={() => setBox("in")}>
            받은함{unread ? ` ${unread}` : ""}
          </button>
          <button data-on={box === "out" ? "1" : "0"} onClick={() => setBox("out")}>
            보낸함
          </button>
        </div>
        <button className="link" onClick={load}>
          새로고침
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {list === null && !err && <p className="empty label">불러오는 중</p>}
      {list && shown.length === 0 && (
        <p className="empty note">{box === "in" ? "아직 받은 것이 없습니다. 내 번호를 친구에게 알려 주세요." : "아직 보낸 것이 없습니다."}</p>
      )}
      <div className="msg-grid">
        {shown.map((m) => (
          <button key={m.id} className="msg" onClick={() => setOpen(m)} data-unread={m.box === "in" && !m.read_at ? "1" : "0"}>
            <Thumb m={m} />
            <span className="msg-line">
              <span className="msg-who num">{m.other === myNumber ? "나" : m.other}</span>
              <span className="msg-when">{when(m.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
      {open && (
        <Viewer
          m={open}
          me={myNumber}
          onClose={() => setOpen(null)}
          onReply={(n) => {
            setOpen(null);
            onReply(n);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
