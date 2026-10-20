"use client";
import { useEffect, useState } from "react";
import { useBackClose } from "@/lib/back";
import { blocks, changePassword, deleteAccount, errText, logout, unblock } from "@/lib/account";

export default function Settings({ number, onClose }: { number: string; onClose: () => void }) {
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [delPw, setDelPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useBackClose(onClose);

  useEffect(() => {
    blocks().then(setBlocked).catch((e) => setErr(errText(e)));
  }, []);

  async function run(f: () => Promise<void>, ok: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await f();
      setMsg(ok);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="설정">
      <div className="sheet-head">
        <span className="label">설정</span>
        <button className="x" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="sheet-body settings">
        <section>
          <span className="label">내 번호</span>
          <div className="row">
            <span className="my-number num">{number}</span>
            <button
              className="btn ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(number);
                  setCopied(true);
                } catch {}
              }}
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <p className="note">이 번호를 아는 사람은 누구나 나에게 사진을 보낼 수 있습니다. 원치 않는 번호는 사진을 연 뒤 차단하세요.</p>
        </section>

        {(msg || err) && <div className={err ? "err" : "ok"}>{err || msg}</div>}

        <section>
          <span className="label">비밀번호 변경</span>
          <input className="field" type="password" placeholder="현재 비밀번호" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
          <input className="field" type="password" placeholder="새 비밀번호 (6자 이상)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          <button
            className="btn ghost wide"
            disabled={busy || !oldPw || newPw.length < 6}
            onClick={() => run(async () => { await changePassword(oldPw, newPw); setOldPw(""); setNewPw(""); }, "비밀번호를 바꿨습니다. 다른 기기는 모두 로그아웃됐습니다.")}
          >
            변경
          </button>
        </section>

        <section>
          <span className="label">차단한 번호</span>
          {blocked === null ? (
            <span className="note">불러오는 중</span>
          ) : blocked.length === 0 ? (
            <span className="note">없음</span>
          ) : (
            blocked.map((n) => (
              <div className="row" key={n}>
                <span className="num">{n}</span>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => run(async () => { await unblock(n); setBlocked((b) => (b || []).filter((x) => x !== n)); }, `${n} 차단을 풀었습니다.`)}
                >
                  차단 풀기
                </button>
              </div>
            ))
          )}
        </section>

        <section>
          <button className="btn wide" disabled={busy} onClick={() => logout().then(onClose)}>
            로그아웃
          </button>
        </section>

        <section>
          <span className="label">계정 삭제</span>
          <p className="note">주고받은 사진과 영상이 양쪽 모두에서 지워지고, 번호는 다른 사람이 쓸 수 있게 됩니다. 되돌릴 수 없습니다.</p>
          <input className="field" type="password" placeholder="비밀번호" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" />
          <button className="btn ghost wide danger" disabled={busy || !delPw} onClick={() => run(async () => { await deleteAccount(delPw); onClose(); }, "계정을 삭제했습니다.")}>
            계정 삭제
          </button>
        </section>
      </div>
    </div>
  );
}
