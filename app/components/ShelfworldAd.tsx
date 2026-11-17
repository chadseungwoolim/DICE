/**
 * Flashy corner banner that opens SHELFWORLD (static 3D library in public/shelfworld).
 * Plain <a>: the target is a static page outside the Next router, so it works the same
 * on Vercel and inside the Capacitor app bundle.
 */
export default function ShelfworldAd() {
  return (
    <a className="sw-ad" href="/shelfworld/index.html" aria-label="SHELFWORLD 들어가기: 3D 도서관으로 이동">
      <span className="sw-ad-hot" aria-hidden="true">★ NEW ★</span>
      <span className="sw-ad-name">SHELFWORLD</span>
      <span className="sw-ad-go">
        들어가기 <span className="sw-ad-arrow" aria-hidden="true">▶▶</span>
      </span>
    </a>
  );
}
