// app/login/page.tsx
export const dynamic = "force-dynamic"; // ✅ 빌드 시 프리렌더 금지(항상 동적)
export const revalidate = 0;

import LoginClient from "./LoginClient";

export default function LoginPage() {
  return <LoginClient />;
}