import type { Metadata } from "next";
import Performance from "./Performance";
export const metadata: Metadata = { title: "E5 performance" };
export default function Page() {
  return <Performance />;
}
