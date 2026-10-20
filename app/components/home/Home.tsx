"use client";
import { useCallback, useEffect, useState } from "react";
import { initAccount, useAccount } from "@/lib/account";
import { SHARED_EVENT, takeInbox } from "@/lib/shareTarget";
import AuthGate from "./AuthGate";
import Compose from "./Compose";
import Inbox from "./Inbox";

export default function Home() {
  const a = useAccount();
  const [compose, setCompose] = useState<{ file?: File | null; to?: string } | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    initAccount();
  }, []);

  // Android share sheet ("Share > Ak"): open the send sheet with that file (after login if needed)
  useEffect(() => {
    const take = () => {
      const f = takeInbox();
      if (f) setPending(f);
    };
    take();
    window.addEventListener(SHARED_EVENT, take);
    return () => window.removeEventListener(SHARED_EVENT, take);
  }, []);
  useEffect(() => {
    if (pending && a.status === "in") {
      setCompose({ file: pending });
      setPending(null);
    }
  }, [pending, a.status]);

  const bump = useCallback(() => setRefresh((x) => x + 1), []);

  if (a.status === "loading") {
    return (
      <div className="home">
        <p className="empty label">연결 중</p>
      </div>
    );
  }
  if (a.status === "out") {
    return (
      <div className="home">
        <AuthGate initialError={a.error} />
        {pending && <p className="note" style={{ textAlign: "center" }}>로그인하면 공유한 파일을 바로 보낼 수 있습니다.</p>}
      </div>
    );
  }

  return (
    <div className="home">
      <button className="send-cta" onClick={() => setCompose({})}>
        <span className="send-plus">+</span>
        <span className="send-text">
          <b>사진 보내기</b>
          <span className="label">사진이나 영상을 번호로 보냅니다</span>
        </span>
      </button>
      <Inbox myNumber={a.number} refreshKey={refresh} onReply={(n) => setCompose({ to: n })} />
      {compose && <Compose initialFile={compose.file} initialTo={compose.to} onClose={() => setCompose(null)} onSent={bump} />}
    </div>
  );
}
