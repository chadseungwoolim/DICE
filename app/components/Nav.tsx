"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLab } from "@/lib/lab";
import AccountChip from "./home/AccountChip";

const lab = [
  { href: "/compress", label: "Compress", match: (p: string) => p.startsWith("/compress") },
  { href: "/share", label: "Share", match: (p: string) => p.startsWith("/share") || p === "/v" || p.startsWith("/v/") },
  { href: "/experiment", label: "Experiment", match: (p: string) => p.startsWith("/experiment") },
];

export default function Nav() {
  const path = usePathname() || "/";
  const open = useLab();
  return (
    <nav className="nav">
      {open &&
        lab.map((it) => (
          <Link key={it.href} href={it.href} data-active={it.match(path) ? "1" : "0"} className="lab-link">
            {it.label}
          </Link>
        ))}
      <AccountChip />
    </nav>
  );
}
