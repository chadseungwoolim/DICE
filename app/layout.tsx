import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "./components/Nav";
import Brand from "./components/Brand";
import ShareInbox from "./components/ShareInbox";

export const metadata: Metadata = {
  title: { default: "Aₖ", template: "Aₖ — %s" },
  description: "번호로 주고받는 초저용량 사진과 영상. 사진은 rank-k SVD, 영상은 시간축과 공간축 SVD로 줄여 보냅니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="top">
          <Brand />
          <Nav />
        </header>
        <ShareInbox />
        <main>{children}</main>
        <footer className="foot">
          <span>A<sub>k</sub> = U<sub>k</sub>Σ<sub>k</sub>V<sub>k</sub><sup>T</sup></span>
          <span>BUSAN IL/L2K1</span>
        </footer>
      </body>
    </html>
  );
}
