"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const HIDE_KEY = "sw-ad-hide-until";
const HOUR = 60 * 60 * 1000;

function hiddenUntil(): number {
  try {
    return Number(localStorage.getItem(HIDE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * SHELFWORLD banner. Loud on purpose, unlike the rest of the site.
 * Shows as a big centred popup when the home page opens (unless hidden for an hour),
 * and stays as a small corner banner after it is closed.
 */
export default function ShelfworldAd() {
  const [popup, setPopup] = useState(false);
  const enter = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (Date.now() >= hiddenUntil()) setPopup(true);
  }, []);

  useEffect(() => {
    if (!popup) return;
    enter.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopup(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  const hideHour = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HOUR));
    } catch {
      /* private mode: just close */
    }
    setPopup(false);
  };

  if (popup) {
    return (
      <div className="sw-pop" role="dialog" aria-modal="true" aria-label="SHELFWORLD 안내" onClick={() => setPopup(false)}>
        <div className="sw-pop-box" onClick={(e) => e.stopPropagation()}>
          <Link ref={enter} className="sw-ad sw-ad-big" href="/shelfworld" aria-label="SHELFWORLD 들어가기: 3D 도서관으로 이동">
            <span className="sw-ad-hot" aria-hidden="true">★ NEW ★</span>
            <span className="sw-ad-name">SHELFWORLD</span>
            <span className="sw-ad-sub">智能書架</span>
            <span className="sw-ad-go">
              들어가기 <span className="sw-ad-arrow" aria-hidden="true">▶▶</span>
            </span>
          </Link>
          <div className="sw-pop-actions">
            <button type="button" onClick={hideHour}>1시간 동안 안 보기</button>
            <button type="button" onClick={() => setPopup(false)}>안 보기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link className="sw-ad" href="/shelfworld" aria-label="SHELFWORLD 들어가기: 3D 도서관으로 이동">
      <span className="sw-ad-hot" aria-hidden="true">★ NEW ★</span>
      <span className="sw-ad-name">SHELFWORLD</span>
      <span className="sw-ad-go">
        들어가기 <span className="sw-ad-arrow" aria-hidden="true">▶▶</span>
      </span>
    </Link>
  );
}
