"use client";

import Image from "next/image";
import { LogOut, User } from "lucide-react";
import { useAuth, useUser } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export function FnoNinjaProfileMenu() {
  const { user } = useUser();
  const auth = useAuth();

  if (!user) return null;

  const handleSignOut = () => {
    if (auth) initiateSignOut(auth);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border transition-colors hover:opacity-90"
          style={{
            borderColor: FNO_NAV_BORDER,
            backgroundColor: "rgba(37,99,235,0.08)",
          }}
          aria-label="Account menu"
        >
          {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt=""
              width={36}
              height={36}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <User className="h-4 w-4" style={{ color: "#60a5fa" }} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border shadow-2xl"
        style={{
          backgroundColor: "#0d1b2e",
          borderColor: FNO_NAV_BORDER,
          color: "#f0f4ff",
        }}
      >
        <div className="px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-white">
            {user.displayName || "Account"}
          </p>
          <p className="truncate text-[11px]" style={{ color: "#64748b" }}>
            {user.email}
          </p>
        </div>
        <DropdownMenuSeparator style={{ backgroundColor: FNO_NAV_BORDER }} />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-xs font-semibold focus:text-white"
          style={{ color: "#f87171" }}
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
