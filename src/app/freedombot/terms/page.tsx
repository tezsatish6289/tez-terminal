import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Use — FreedomBot.ai",
};

export default function TermsPage() {
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
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>FreedomBot.ai</span>
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
          Terms of{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
          >
            Use
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
            Our Terms of Use are currently being prepared and will be published
            here soon. By using FreedomBot.ai, you agree to use the platform
            responsibly and understand that trading involves risk.
          </p>
        </div>
      </div>
    </div>
  );
}
