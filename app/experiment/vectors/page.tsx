import type { Metadata } from "next";
import Vectors from "./Vectors";
export const metadata: Metadata = { title: "E2 singular vectors" };
export default function Page() {
  return <Vectors />;
}
