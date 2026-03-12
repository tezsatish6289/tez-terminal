"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OpportunitiesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signals");
  }, [router]);
  return null;
}
