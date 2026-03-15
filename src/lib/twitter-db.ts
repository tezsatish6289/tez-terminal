import { getAdminFirestore } from '@/firebase/admin';

const POSTED = 'twitter_posted';
const PROCESSED = 'twitter_processed';

export interface PostRecord {
  tweetId: string;
  content: string;
  timestamp: string;
  agent_name: string;
  postType: 'trade_report' | 'liquidation' | 'meme' | 'influencer';
  metadata?: Record<string, unknown>;
}

export interface ProcessedRecord {
  tweetId: string;
  username: string;
  timestamp: string;
  agent_name: string;
  action: 'quoted' | 'commented' | 'skipped';
}

// ─── Dedup Guards ────────────────────────────────────────────────────

export async function hasPostedToday(postType: string): Promise<boolean> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().slice(0, 10);
  const snap = await db
    .collection(POSTED)
    .where('postType', '==', postType)
    .where('date', '==', today)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function hasProcessedTweet(tweetId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(PROCESSED)
    .where('tweetId', '==', tweetId)
    .limit(1)
    .get();
  return !snap.empty;
}

// ─── Write Records ──────────────────────────────────────────────────

export async function savePost(data: PostRecord): Promise<void> {
  const db = getAdminFirestore();
  await db.collection(POSTED).add({
    ...data,
    date: data.timestamp.slice(0, 10),
  });
}

export async function saveProcessedTweet(data: ProcessedRecord): Promise<void> {
  const db = getAdminFirestore();
  await db.collection(PROCESSED).add(data);
}

// ─── Read / Stats ───────────────────────────────────────────────────

export async function getRecentActivity(limit: number = 20) {
  const db = getAdminFirestore();
  const posts = await db
    .collection(POSTED)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return posts.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTodayStats() {
  const db = getAdminFirestore();
  const today = new Date().toISOString().slice(0, 10);
  const snap = await db.collection(POSTED).where('date', '==', today).get();
  const postTypes = snap.docs.map((d) => d.data().postType as string);
  return { postsToday: snap.size, postTypes };
}
