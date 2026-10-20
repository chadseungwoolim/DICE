"use client";
import { useState } from "react";
import { errText, login, signup } from "@/lib/account";

export default function AuthGate({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [num, setNum] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  const numOk = /^[0-9]{4,8}$/.test(num);
  const pwOk = pw.length >= 6;
  const can = numOk && pwOk && (mode === "login" || pw === pw2) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!can) return;
    setBusy(true);
    setErr("");
    try {
      if (mode === "login") await login(num, pw);
      else await signup(num, pw);
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-mark">
        A<sub>k</sub>
      </div>
      <p className="auth-sub">번호로 주고받는 초저용량 사진과 영상</p>
      <div className="seg auth-seg">
        <button type="button" data-on={mode === "login" ? "1" : "0"} onClick={() => { setMode("login"); setErr(""); }}>
          로그인
        </button>
        <button type="button" data-on={mode === "signup" ? "1" : "0"} onClick={() => { setMode("signup"); setErr(""); }}>
          번호 만들기
        </button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label className="fl">
          <span className="label">{mode === "signup" ? "원하는 번호 (숫자 4~8자리)" : "번호"}</span>
          <input
            className="field big"
            inputMode="numeric"
            autoComplete="username"
            maxLength={8}
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
            placeholder="1234"
            name="number"
          />
        </label>
        <label className="fl">
          <span className="label">비밀번호{mode === "signup" ? " (6자 이상)" : ""}</span>
          <input
            className="field big"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            name="password"
          />
        </label>
        {mode === "signup" && (
          <label className="fl">
            <span className="label">비밀번호 확인</span>
            <input className="field big" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} name="password2" />
            {pw2 && pw !== pw2 && <span className="hint signal">비밀번호가 서로 다릅니다.</span>}
          </label>
        )}
        {err && <div className="err">{err}</div>}
        <button className="btn solid wide tall" disabled={!can}>
          {busy ? "확인 중" : mode === "login" ? "로그인" : "번호 만들기"}
        </button>
        {mode === "signup" && (
          <p className="note">이메일이나 전화번호는 받지 않습니다. 번호와 비밀번호를 잊으면 되찾을 방법이 없으니 따로 적어 두세요.</p>
        )}
      </form>
    </div>
  );
}
