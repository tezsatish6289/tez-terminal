
"use client";

import { User, LogOut, Zap, History, LineChart, Webhook, Target, BellRing, BellOff, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser, useAuth } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useTradeAlertsContext } from "@/contexts/trade-alerts-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function formatAlertTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function TopBar() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.email === "hello@tezterminal.com";
  const { enabled, history, enable, disable, clearHistory } = useTradeAlertsContext();
  const unreadCount = history.length;

  const handleLogout = () => {
    if (auth) {
      initiateSignOut(auth);
      toast({
        title: "Session Ended",
        description: "You have been logged out successfully.",
      });
    }
  };

  const navItems = [
    { name: "Opportunity Finder", icon: Zap, href: "/" },
    { name: "Analytics", icon: LineChart, href: "/analytics" },
    { name: "History", icon: History, href: "/history" },
  ];

  const adminItems = [
    { name: "Bridge Config", icon: Webhook, href: "/webhooks" },
  ];

  return (
    <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full">
      <div className="relative flex h-full items-center px-4 justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Target className="h-5 w-5 text-accent" />
          <span className="font-black text-lg text-accent tracking-tight leading-tight">TezTerminal.com</span>
        </Link>

        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "relative flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all",
                  enabled
                    ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
              >
                {enabled ? (
                  <BellRing className="h-3.5 w-3.5" />
                ) : (
                  <BellOff className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{enabled ? "Alerts" : "Alerts off"}</span>
                {enabled && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-accent text-[10px] font-black text-accent-foreground flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 bg-card border-border shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Trade Alerts</span>
                <button
                  onClick={enabled ? disable : enable}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors",
                    enabled
                      ? "text-negative hover:bg-negative/10"
                      : "text-accent hover:bg-accent/10",
                  )}
                >
                  {enabled ? "Turn off" : "Turn on"}
                </button>
              </div>

              {!enabled ? (
                <div className="px-4 py-8 text-center">
                  <BellOff className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Alerts are off</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    Turn on to get notified when trades align with market sentiment
                  </p>
                </div>
              ) : history.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <BellRing className="h-8 w-8 text-accent/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No alerts yet</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    You'll be notified when an aligned trade comes in
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-72 overflow-y-auto divide-y divide-border/30">
                    {history.map((alert) => (
                      <Link
                        key={alert.id + alert.timestamp}
                        href={`/chart/${alert.id}`}
                        className="block px-4 py-3 hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {alert.direction === "Bullish" ? (
                              <TrendingUp className="h-3.5 w-3.5 text-positive shrink-0" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-negative shrink-0" />
                            )}
                            <span className="text-sm font-black uppercase tracking-tight truncate">{alert.symbol}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{formatAlertTime(alert.timestamp)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 pl-[22px]">
                          {alert.direction} {alert.timeframeName} — {alert.sentimentLabel}
                        </p>
                      </Link>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-border/50">
                    <button
                      onClick={clearHistory}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear all
                    </button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full border border-border/50 h-9 w-9 hover:bg-accent/10">
                <User className="h-5 w-5 text-accent" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-2xl">
              <div className="px-2 py-2">
                <p className="text-sm font-medium text-foreground truncate">{user?.displayName || 'Anonymous'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Navigate</DropdownMenuLabel>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <DropdownMenuItem key={item.name} asChild className={cn("cursor-pointer gap-2.5", isActive && "bg-accent/10 text-accent")}>
                    <Link href={item.href}>
                      <item.icon className={cn("h-4 w-4", isActive ? "text-accent" : "text-muted-foreground")} />
                      <span className="text-xs font-medium">{item.name}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Admin</DropdownMenuLabel>
                  {adminItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <DropdownMenuItem key={item.name} asChild className={cn("cursor-pointer gap-2.5", isActive && "bg-accent/10 text-accent")}>
                        <Link href={item.href}>
                          <item.icon className={cn("h-4 w-4", isActive ? "text-accent" : "text-muted-foreground")} />
                          <span className="text-xs font-medium">{item.name}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2 text-xs font-bold" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5" />
                Logout Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
