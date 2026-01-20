"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      aria-label="back"
      style={{
        width: 54,
        height: 54,
        borderRadius: 999,
        border: "2px solid var(--orange)",
        background: "transparent",
        color: "var(--orange)",
        fontWeight: 900,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
      뒤로가기
    </button>
  );
}
