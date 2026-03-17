"use client";

import { LandingPage } from "@/components/landing/LandingPage";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { trackSignInClicked, trackLogin } from "@/firebase/analytics";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const prevUser = useRef(user);

  useEffect(() => {
    if (user && !prevUser.current) {
      trackLogin('google');
    }
    prevUser.current = user;
  }, [user]);

  useEffect(() => {
    if (user) {
      router.replace("/signals");
    }
  }, [user, router]);

  const handleGoogleLogin = useCallback(async () => {
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

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return <LandingPage onLogin={handleGoogleLogin} isLoggingIn={isLoggingIn} />;
}
