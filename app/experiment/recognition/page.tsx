import type { Metadata } from "next";
import Recognition from "./Recognition";
export const metadata: Metadata = { title: "E3 size vs recognition" };
export default function Page() {
  return <Recognition />;
}
