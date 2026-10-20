"use client";
import { useEffect, useRef, useState } from "react";
import { errText, getAccount, numberExists, recentNumbers, sendFile } from "@/lib/account";
import { prepareFile, type Prepared } from "@/lib/media";
import { bytes as fmtBytes } from "@/lib/fmt";
import PixelView from "./PixelView";
import { useBackClose } from "@/lib/back";

type Props = { initialFile?: File | null; initialTo?: string; onClose: () => void; onSent: () => void };

export default function Compose({ initialFile, initialTo, onClose, onSent }: Props) {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [stage, setStage] = useState("");
  const [prog, setProg] = useState<number | undefined>();
  const [to, setTo] = useState(initialTo || "");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const acct = getAccount();
  const myNumber = acct.status === "in" ? acct.number : "";
  useBackClose(onClose);
  const recent = recentNumbers().filter((n) => n !== myNumber).slice(0, 6);

  useEffect(() => {
    if (!file) return;
    let dead = false;
    setPrep(null);
    setErr("");
    prepareFile(file, (s, f) => {
      if (!dead) {
        setStage(s);
        setProg(f);
      }
    })
      .then((p) => !dead && setPrep(p))
      .catch((e) => !dead && setErr(errText(e)))
      .finally(() => !dead && setStage(""));
    return () => {
      dead = true;
    };
  }, [file]);

  const toOk = /^[0-9]{4,8}$/.test(to);

  async function send() {
    if (!prep || !toOk || sending) return;
    setSending(true);
    setErr("");
    try {
      if (!(await numberExists(to))) throw new Error("no_such_number");
      await sendFile(to, prep.bytes, prep.kind, prep.meta);
      setDone(true);
      onSent();
      setTimeout(onClose, 900);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="보내기">
      <div className="sheet-head">
        <span className="label">보내기</span>
        <button className="x" onClick={onClose} aria-label="닫기">
          닫기
        </button>
      </div>
      <div className="sheet-body">
        {!file ? (
          <button className="pick" onClick={() => input.current?.click()}>
            <span className="pick-plus">+</span>
            <span>사진 또는 영상 고르기</span>
            <span className="label">사진은 약 4 KB, 영상은 약 10 KB로 줄여서 보냅니다</span>
          </button>
        ) : (
          <div className="compose-preview">
            <div className="preview-box">
              {prep ? (
                <PixelView p={prep.pixels} className="preview-canvas" />
              ) : (
                <div className="preview-wait">
                  <span className="label">{stage || "준비 중"}</span>
                  {prog !== undefined && (
                    <div className="bar" style={{ width: 160, marginTop: 10 }}>
                      <i style={{ width: `${prog * 100}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="row preview-meta">
              <span className="num">
                {prep ? (
                  <>
                    <b>{fmtBytes(prep.bytes.length)}</b>
                    <span className="muted"> / 원본 {fmtBytes(file.size)}</span>
                  </>
                ) : (
                  <span className="muted">원본 {fmtBytes(file.size)}</span>
                )}
              </span>
              <button className="link" onClick={() => { setFile(null); setPrep(null); }} disabled={sending}>
                다른 파일
              </button>
            </div>
            {prep?.note && <p className="note">{prep.note}</p>}
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          className="hide"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = "";
          }}
        />

        <label className="fl" style={{ marginTop: 18 }}>
          <span className="label">받는 사람 번호</span>
          <input
            className="field big"
            inputMode="numeric"
            maxLength={8}
            placeholder="번호 입력"
            value={to}
            onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
            name="to"
          />
        </label>
        {(recent.length > 0 || myNumber) && (
          <div className="chips">
            {recent.map((n) => (
              <button key={n} className="chip-btn" data-on={to === n ? "1" : "0"} onClick={() => setTo(n)}>
                {n}
              </button>
            ))}
            {myNumber && (
              <button className="chip-btn" data-on={to === myNumber ? "1" : "0"} onClick={() => setTo(myNumber)}>
                나에게
              </button>
            )}
          </div>
        )}
        {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
        <button className="btn solid wide tall" style={{ marginTop: 18 }} disabled={!prep || !toOk || sending || done} onClick={send}>
          {done ? "보냈습니다" : sending ? "보내는 중" : toOk ? `${to}에게 보내기` : "보내기"}
        </button>
      </div>
    </div>
  );
}
