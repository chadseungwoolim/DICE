"use client";
import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        zIndex: 1000,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "var(--orange)",
        color: "#000",
        fontWeight: 900,
        border: "none",
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
      }}
    >
      뒤로<br />가기
    </button>
  );
}