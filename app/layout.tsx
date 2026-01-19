import "./globals.css";

export const metadata = {
  title: "DICE",
  description: "School galleries like a community board",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}