/** Cap shown on chat unread badges (matches live unread window semantics). */
export const CHAT_UNREAD_BADGE_CAP = 9;

export function formatChatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > CHAT_UNREAD_BADGE_CAP ? `${CHAT_UNREAD_BADGE_CAP}+` : String(count);
}

export function sumChatUnreadCounts(unreadByRoom: Record<string, number>): number {
  let total = 0;
  for (const n of Object.values(unreadByRoom)) total += n;
  return total;
}
