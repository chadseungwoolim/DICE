import type { Metadata } from "next";
import ShareList from "./ShareList";

export const metadata: Metadata = { title: "share" };

export default function Page() {
  return (
    <div className="wrap">
      <ShareList />
    </div>
  );
}
