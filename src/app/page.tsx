"use client";

import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { trackSignInClicked, trackLogin, trackCtaClick } from "@/firebase/analytics";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Chrome } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const prevUser = useRef(user);

  useEffect(() => {
    if (user && !prevUser.current) {
      trackLogin("google");
    }
    prevUser.current = user;
  }, [user]);

  useEffect(() => {
    if (user) {
      router.replace("/live");
    }
  }, [user, router]);

  const handleGoogleLogin = useCallback(async () => {
    trackCtaClick("tt_sign_in", { label: "Sign in with Google" });
    if (auth) {
      trackSignInClicked();
      setIsLoggingIn(true);
      try {
        await initiateGoogleSignIn(auth);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: e.message || "Could not authenticate with Google.",
        });
      } finally {
        setIsLoggingIn(false);
      }
    }
  }, [auth]);

  if (isUserLoading || user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">TezTerminal</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to continue.</p>
        <Button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          className="mt-8 h-12 w-full gap-3 bg-white text-black hover:bg-white/90 text-base font-semibold"
        >
          {isLoggingIn ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Chrome className="h-5 w-5" />
              Sign in with Google
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
