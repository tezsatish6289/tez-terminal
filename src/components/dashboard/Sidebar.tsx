
"use client";

import { LayoutDashboard, LineChart, History, Zap, ShieldCheck, Heart, TrendingUp, TrendingDown, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { WATCHLIST } from "@/app/lib/mock-data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Terminal", icon: LayoutDashboard, href: "/" },
  { name: "Signals", icon: Zap, href: "/signals" },
  { name: "Webhooks", icon: Webhook, href: "/webhooks" },
  { name: "Analytics", icon: LineChart, href: "/analytics" },
  { name: "History", icon: History, href: "/history" },
];

export function LeftSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-sidebar hidden lg:flex flex-col h-screen sticky top-0 overflow-hidden">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="bg-primary p-1.5 rounded-lg border border-accent/20">
            <Zap className="h-6 w-6 text-accent fill-accent/20" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-accent">TezTerminal</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Antigravity</p>
          </div>
        </Link>
      </div>

      <nav className="px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all group",
                isActive 
                  ? "bg-accent text-accent-foreground shadow-lg shadow-accent/10" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-accent-foreground" : "group-hover:text-accent")} />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 px-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Watchlist</h2>
          <Heart className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-accent" />
        </div>
        
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-1">
            {WATCHLIST.map((item) => (
              <div key={item.symbol} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group">
                <div>
                  <div className="text-sm font-semibold">{item.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">Volume 24h: 1.2B</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">{item.price}</div>
                  <div className={cn(
                    "text-[10px] flex items-center justify-end gap-0.5",
                    item.change.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {item.change.startsWith('+') ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {item.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-background/50">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-white/5">
          <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/20">
            <ShieldCheck className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium truncate">Lucknow Trader</p>
            <p className="text-[10px] text-muted-foreground">Pro Merchant</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
