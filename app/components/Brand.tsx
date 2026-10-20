"use client";
import Link from "next/link";
import { useState } from "react";
import { secretTap } from "@/lib/lab";

/** Logo. Five quick taps open (or close) the hidden lab menu. */
export default function Brand() {
  const [toast, setToast] = useState("");
  return (
    <>
      <Link
        href="/"
        className="brand"
        onClick={() => {
          const r = secretTap();
          if (r !== null) {
            setToast(r ? "실험실 열림" : "실험실 닫힘");
            setTimeout(() => setToast(""), 1600);
          }
        }}
      >
        <span className="mark">
          A<sub>k</sub>
        </span>
      </Link>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
