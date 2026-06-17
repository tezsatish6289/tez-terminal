import { MUSIC_TRACKS } from "./generated-tracks";

/** Pick a track for this day + video type so put/call differ and the pick rotates daily. */
export function pickMusicTrack(dateLabel: string, variant: "put" | "call"): string {
  if (!MUSIC_TRACKS.length) return "audio/hitslab-the-vlog-vlog-vlogs-background-music-333116.mp3";
  let h = variant === "call" ? 17 : 0;
  for (const c of dateLabel) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return MUSIC_TRACKS[Math.abs(h) % MUSIC_TRACKS.length]!;
}
