import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "About Us — FreedomBot.ai",
};

export default function AboutPage() {
  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.85)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Image
              src="/freedombot/logo.png"
              alt="FreedomBot.ai"
              width={160}
              height={48}
              className="object-contain h-9 w-auto"
            />
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm mb-10 transition-colors"
          style={{ color: "#64748b" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-6">
          About{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
          >
            FreedomBot.ai
          </span>
        </h1>

        <div
          className="rounded-2xl p-5 sm:p-8"
          style={{
            backgroundColor: "#0f2044",
            border: "1px solid rgba(90,140,220,0.15)",
          }}
        >
          <p className="text-lg" style={{ color: "#94a3b8" }}>
            This page is coming soon. We&apos;re working on sharing our story,
            mission, and the team behind FreedomBot.ai. Check back shortly!
          </p>
        </div>
      </div>
    </div>
  );
}
