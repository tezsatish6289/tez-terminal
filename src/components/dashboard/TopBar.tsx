
"use client";

import { User, LogOut, Zap, History, LineChart, Webhook, Settings, CreditCard, Bell, Gift, Users, Twitter, Activity, Link2 } from "lucide-react";
import { RadarIcon } from "@/components/icons/RadarIcon";
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
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user?.email === "hello@tezterminal.com";
  const handleLogout = () => {
    if (auth) {
      initiateSignOut(auth);
      router.push("/");
      toast({
        title: "Session Ended",
        description: "You have been logged out successfully.",
      });
    }
  };

  const navItems = [
    { name: "Signals", icon: Zap, href: "/signals" },
    { name: "Simulator", icon: Activity, href: "/simulation" },
    { name: "Live", icon: Zap, href: "/live" },
    { name: "Trade Audit", icon: LineChart, href: "/trade-audit" },
    { name: "Purchases", icon: CreditCard, href: "/purchases" },
    { name: "Referrals", icon: Gift, href: "/referrals" },
    { name: "Settings", icon: Bell, href: "/settings" },
  ];

  const adminItems = [
    { name: "Users", icon: Users, href: "/admin/users" },
    { name: "Social", icon: Twitter, href: "/admin/social" },
    { name: "Blockchain", icon: Link2, href: "/admin/blockchain" },
    { name: "History", icon: History, href: "/history" },
    { name: "Bridge Config", icon: Webhook, href: "/webhooks" },
  ];

  return (
    <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full">
      <div className="relative flex h-full items-center px-4 justify-between gap-4">
        <Link href="/signals" className="flex items-center gap-2.5">
          <RadarIcon className="h-5 w-5 text-accent" />
          <span className="font-black text-lg text-accent tracking-tight leading-tight">TezTerminal.com</span>
        </Link>

        <div className="flex items-center gap-3">
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
