"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirestore, useUser } from "@/firebase";
import type { ChatMemberDoc } from "@/lib/chat/types";

export interface UseChatMemberResult {
  member: ChatMemberDoc | null;
  loading: boolean;
}

/**
 * Live view of the current user's `chat_members/{uid}` doc — canChat, ban
 * status, and terms acceptance. Owner-readable per Firestore rules.
 */
export function useChatMember(): UseChatMemberResult {
  const firestore = useFirestore();
  const { user } = useUser();
  const [member, setMember] = useState<ChatMemberDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMember(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(firestore, "chat_members", user.uid),
      (snap) => {
        setMember(snap.exists() ? (snap.data() as ChatMemberDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [firestore, user]);

  return { member, loading };
}
