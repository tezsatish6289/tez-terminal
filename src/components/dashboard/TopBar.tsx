
"use client";

import { Bell, User, Settings, LayoutDashboard, LogOut, Menu, Zap, History, LineChart, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.email === "hello@tezterminal.com";

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
      <div className="flex h-full items-center px-4 justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-accent hover:bg-accent/10">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar border-r border-border p-0 w-72">
              <SheetHeader className="p-6 border-b border-border/50 text-left">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <Link href="/" className="flex items-center gap-3">
                  <div className="bg-primary p-1.5 rounded-lg border border-accent/20">
                    <Zap className="h-6 w-6 text-accent fill-accent/20" />
                  </div>
                  <div>
                    <h1 className="font-bold text-lg tracking-tight text-accent">TezTerminal</h1>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Antigravity</p>
                  </div>
                </Link>
              </SheetHeader>

              <nav className="p-4 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-2">Navigation</p>
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <SheetClose asChild key={item.name}>
                      <Link
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
                    </SheetClose>
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
                        <SheetClose asChild key={item.name}>
                          <Link
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
                        </SheetClose>
                      );
                    })}
                  </>
                )}
              </nav>

              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-background/50">
                 <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-white/5">
                   <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/20">
                     <User className="h-4 w-4 text-accent" />
                   </div>
                   <div className="flex-1 overflow-hidden">
                     <p className="text-xs font-medium truncate text-foreground">{isAdmin ? 'Turbo Admin' : 'Trader'}</p>
                     <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                   </div>
                 </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 mr-2">
             <span className="font-bold text-lg text-accent tracking-tighter hidden sm:inline-block">TezTerminal</span>
          </div>

        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Badge variant="outline" className="border-accent/30 text-accent gap-1 py-1 px-3 bg-accent/5">
              <span className={`h-1.5 w-1.5 rounded-full ${user ? 'bg-accent animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                {isUserLoading ? 'Connecting...' : isAdmin ? 'Admin Terminal' : 'Live Node'}
              </span>
            </Badge>
          </div>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent h-9 w-9">
            <Bell className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full border border-border/50 h-9 w-9 hover:bg-accent/10">
                <User className="h-5 w-5 text-accent" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-2xl">
              <DropdownMenuLabel className="text-xs font-bold text-muted-foreground uppercase">Terminal Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground truncate">{user?.displayName || 'Anonymous'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-xs">Profile Settings</DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-xs">API Tokens</DropdownMenuItem>
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
