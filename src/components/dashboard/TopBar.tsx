
"use client";

import { Bell, Search, User, Settings, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "@/hooks/use-toast";

export function TopBar() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const isAdmin = user?.email === "hello@turbogains.ai";

  const handleLogout = () => {
    if (auth) {
      initiateSignOut(auth);
      toast({
        title: "Session Ended",
        description: "You have been logged out successfully.",
      });
    }
  };

  return (
    <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full">
      <div className="flex h-full items-center px-6 justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <div className="flex items-center gap-2 mr-4 lg:hidden">
             <LayoutDashboard className="h-6 w-6 text-accent" />
             <span className="font-bold text-lg text-accent">TezTerminal</span>
          </div>
          <div className="relative w-full max-w-sm hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search pairs, signals..."
              className="pl-8 bg-secondary/50 border-none focus-visible:ring-1 focus-visible:ring-accent h-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 mr-2">
            <Badge variant="outline" className="border-accent/50 text-accent gap-1 py-1">
              <span className={`h-2 w-2 rounded-full ${user ? 'bg-accent animate-pulse' : 'bg-amber-500'}`} />
              {isUserLoading ? 'Connecting...' : isAdmin ? 'Admin Terminal' : 'Consumer Node'}
            </Badge>
          </div>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent">
            <Bell className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent">
            <Settings className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full border border-border/50">
                <User className="h-5 w-5 text-accent" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border">
              <DropdownMenuLabel>Traders Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs truncate font-mono text-muted-foreground">
                {user?.email || user?.uid.substring(0, 12)}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">Profile Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
