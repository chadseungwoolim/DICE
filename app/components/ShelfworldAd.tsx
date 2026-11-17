import Link from "next/link";

/** Flashy corner banner that opens SHELFWORLD (/shelfworld). Loud on purpose, unlike the rest of the site. */
export default function ShelfworldAd() {
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
