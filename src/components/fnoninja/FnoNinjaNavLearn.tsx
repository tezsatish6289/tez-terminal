"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

/** Learn hub — icon button in nav, left of symbol search. */
export function FnoNinjaNavLearn() {
  const pathname = usePathname();
  const href = fnoLearnHref(pathname);
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-colors shrink-0 hover:text-white"
      style={{
        color: active ? "#93c5fd" : "#94a3b8",
        border: `1px solid ${active ? "rgba(96,165,250,0.35)" : "rgba(90,140,220,0.15)"}`,
        backgroundColor: active ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.06)",
      }}
      aria-label="Learn guides"
      title="Learn"
    >
      <GraduationCap className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
    </Link>
  );
}
