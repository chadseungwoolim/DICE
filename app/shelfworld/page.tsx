import type { Metadata } from "next";
import ShelfWorld from "./ShelfWorld";

export const metadata: Metadata = { title: "智能書架", description: "국립중앙도서관 소장 도서를 KDC 청구기호 자리에 꽂아 둔 3D 서가" };

export default function Page() {
  return <ShelfWorld />;
}
