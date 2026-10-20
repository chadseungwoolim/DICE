"use client";
import { useEffect, useState } from "react";
import { initAccount, useAccount } from "@/lib/account";
import Settings from "./Settings";

/** Header: my number; tap for settings (password, blocked numbers, logout, delete account). */
export default function AccountChip() {
  const a = useAccount();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    initAccount();
  }, []);
  if (a.status !== "in") return null;
  return (
    <>
      <button className="acct" onClick={() => setOpen(true)} aria-label="설정">
        <span className="acct-k">No.</span>
        <span className="num">{a.number}</span>
      </button>
      {open && <Settings number={a.number} onClose={() => setOpen(false)} />}
    </>
  );
}
