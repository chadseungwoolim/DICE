import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Viewer from "./Viewer";

const ID_RE = /^[twm][A-Za-z0-9]{10}$/;

export const metadata: Metadata = { title: "shared", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const src = `${base}/storage/v1/object/public/media/${id}`;
  return (
    <>
      {base && <link rel="preload" href={src} as="fetch" crossOrigin="anonymous" />}
      <Viewer id={id} src={src} />
    </>
  );
}
