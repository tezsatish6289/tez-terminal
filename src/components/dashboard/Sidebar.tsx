
"use client";

import { LayoutDashboard, LineChart, History, Zap, ShieldCheck, Heart, Webhook, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { WATCHLIST } from "@/app/lib/mock-data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/firebase";

export function LeftSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const isAdmin = user?.email === "hello@tezterminal.com";

  const navItems = [
    { name: "Terminal", icon: LayoutDashboard, href: "/" },
    { name: "Trade Audit", icon: LineChart, href: "/trade-audit" },
    { name: "Purchases", icon: CreditCard, href: "/billing" },
    { name: "History", icon: History, href: "/history" },
  ];

  const adminItems = [
    { name: "Bridge Config", icon: Webhook, href: "/webhooks" },
  ];

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

        {isAdmin && (
          <>
            <div className="pt-6 pb-2 px-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Admin Control</p>
            </div>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all group border border-dashed border-accent/20",
                    isActive 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:bg-accent/5 hover:text-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-xs font-semibold">{item.name}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="mt-8 px-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Global Markets</h2>
          <Heart className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-accent" />
        </div>
        
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          <div className="space-y-1">
            {WATCHLIST.map((item) => (
              <div key={item.symbol} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group">
                <div>
                  <div className="text-sm font-semibold">{item.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">{item.price}</div>
                </div>
                <div className={cn(
                  "text-[10px]",
                  item.change.startsWith('+') ? "text-positive" : "text-negative"
                )}>
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-background/50">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-white/5">
          <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/20">
            <ShieldCheck className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium truncate">{isAdmin ? 'Turbo Admin' : 'Trade Consumer'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email || 'Not Signed In'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
