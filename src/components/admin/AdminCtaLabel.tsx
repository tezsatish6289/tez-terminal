"use client";

import { AdminInfoTip } from "@/components/admin/AdminInfoTip";
import { cn } from "@/lib/utils";

/** Wraps a CTA control with a hover info icon describing what it does. */
export function AdminCtaWithInfo({
  description,
  children,
  className,
}: {
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {children}
      <AdminInfoTip text={description} />
    </span>
  );
}
