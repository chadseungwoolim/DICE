"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Compress", match: (p: string) => p === "/" },
  { href: "/share", label: "Share", match: (p: string) => p.startsWith("/share") || p.startsWith("/v/") },
  { href: "/experiment", label: "Experiment", match: (p: string) => p.startsWith("/experiment") },
];

export default function Nav() {
  const path = usePathname() || "/";
  return (
    <nav className="nav">
      {items.map((it) => (
        <Link key={it.href} href={it.href} data-active={it.match(path) ? "1" : "0"}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
