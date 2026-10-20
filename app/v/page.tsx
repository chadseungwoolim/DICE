"use client";
// Query-string viewer: /v/?id=<id>. Used by the bundled app (no server, so no dynamic route) and as a fallback on the web.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Viewer from "../components/Viewer";
import { ID_RE, publicUrl } from "@/lib/store";

function Inner() {
  const id = useSearchParams().get("id") || "";
  if (!ID_RE.test(id)) {
    return (
      <div className="wrap">
        <div className="section-head"><span className="mono">/</span></div>
        <div className="err" style={{ margin: "16px 0" }}>not found: invalid id</div>
      </div>
    );
  }
  return <Viewer key={id} id={id} src={publicUrl(id)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap"><span className="label">loading</span></div>}>
      <Inner />
    </Suspense>
  );
}
