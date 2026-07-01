import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { FnoNinjaReplaysGallery } from "@/components/fnoninja/FnoNinjaReplaysGallery";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { listSrReplaysWithStories } from "@/lib/fnoninja/sr-replays";
import { parseSrReplaySort } from "@/lib/fnoninja/sr-replay-types";
import { FNONINJA_SITE_METADATA } from "@/lib/fnoninja/metadata";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

export const metadata: Metadata = {
  ...FNONINJA_SITE_METADATA,
  title: "Zone replays — FNONINJA",
  description:
    "Real SR zone audit replays — put-wall bounces and call-wall rejections across NSE F&O. Informational only.",
  openGraph: {
    ...FNONINJA_SITE_METADATA.openGraph,
    title: "Zone replays — FNONINJA",
    description:
      "Real SR zone audit replays — completed moves from put and call clusters to max pain.",
  },
};

type PageProps = {
  searchParams: Promise<{ sort?: string }>;
};

export default async function FnoNinjaReplaysPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sort = parseSrReplaySort(params.sort);
  const replays = await listSrReplaysWithStories({ sort, limit: 100 });

  return (
    <div className="font-sans antialiased min-w-0 flex flex-col flex-1">
      <div className={`${FB_CONTENT_SHELL} py-12 sm:py-16 lg:py-20`}>
        <Link
          href="/fnoninja#real-examples"
          className="inline-flex items-center gap-2 text-sm font-semibold mb-8 transition-colors hover:text-white"
          style={{ color: FNO_MUTED }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <header className="max-w-3xl mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
            Real zone{" "}
            <span style={{ color: FNO_ACCENT }}>replays</span>
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
            Completed moves from SR zone audit — put-wall bounces and call-wall rejections that
            reached max pain. Informational only, not investment advice.
          </p>
        </header>

        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />
            </div>
          }
        >
          <FnoNinjaReplaysGallery initialReplays={replays} initialSort={sort} />
        </Suspense>
      </div>
    </div>
  );
}
