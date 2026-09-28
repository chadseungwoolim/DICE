import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "./components/Nav";

export const metadata: Metadata = {
  title: { default: "Aₖ — low-rank media transfer", template: "Aₖ — %s" },
  description: "Images reduced to a rank-k SVD approximation, videos re-encoded to minimum bitrate, shared by link.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="top">
          <a href="/" className="brand">
            <span className="mark">A<sub>k</sub></span>
            <span className="brand-cap">low-rank media transfer</span>
          </a>
          <Nav />
        </header>
        <main>{children}</main>
        <footer className="foot">
          <span>A<sub>k</sub> = U<sub>k</sub>Σ<sub>k</sub>V<sub>k</sub><sup>T</sup></span>
          <span>client-side compression / no account</span>
        </footer>
      </body>
    </html>
  );
}
