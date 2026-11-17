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

function Shelfworld({ big, linkRef }: { big?: boolean; linkRef?: React.Ref<HTMLAnchorElement> }) {
  return (
    <Link ref={linkRef} className={big ? "sw-ad sw-ad-big" : "sw-ad"} href="/shelfworld" aria-label="SHELFWORLD 들어가기: 3D 도서관으로 이동">
      <span className="sw-ad-hot" aria-hidden="true">★ NEW ★</span>
      <span className="sw-ad-name">SHELFWORLD</span>
      {big && <span className="sw-ad-sub">智能書架</span>}
      <span className="sw-ad-go">
        들어가기 <span className="sw-ad-arrow" aria-hidden="true">▶▶</span>
      </span>
    </Link>
  );
}

// ORBIT is a separate prebuilt app in public/orbit, so it needs a full page load (plain <a>).
function Orbit({ big }: { big?: boolean }) {
  return (
    <a className={big ? "sw-ad sw-ad-big ob-ad" : "sw-ad ob-ad"} href="/orbit/index.html" aria-label="ORBIT 들어가기: 음악 플레이어로 이동">
      <span className="ob-rings" aria-hidden="true" />
      <span className="sw-ad-hot" aria-hidden="true">★ NEW ★</span>
      <span className="sw-ad-name">ORBIT</span>
      {big && <span className="sw-ad-sub">음악 플레이어</span>}
      <span className="sw-ad-go">
        들어가기 <span className="sw-ad-arrow" aria-hidden="true">▶▶</span>
      </span>
    </a>
  );
}

/**
 * SHELFWORLD and ORBIT banners. Loud on purpose, unlike the rest of the site.
 * They show as a big centred popup when the home page opens (unless hidden for an hour),
 * and stay as small corner banners after it is closed.
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
      <div className="sw-pop" role="dialog" aria-modal="true" aria-label="SHELFWORLD, ORBIT 안내" onClick={() => setPopup(false)}>
        <div className="sw-pop-box" onClick={(e) => e.stopPropagation()}>
          <div className="sw-pop-ads">
            <Shelfworld big linkRef={enter} />
            <Orbit big />
          </div>
          <div className="sw-pop-actions">
            <button type="button" onClick={hideHour}>1시간 동안 안 보기</button>
            <button type="button" onClick={() => setPopup(false)}>안 보기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sw-corner">
      <Orbit />
      <Shelfworld />
    </div>
  );
}
