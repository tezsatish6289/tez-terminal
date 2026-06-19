/**
 * Builds a shuffled FFmpeg concat playlist over the bundled music clips.
 * The concat demuxer + `-stream_loop -1` then plays them gaplessly on repeat
 * for the whole broadcast, in a fresh random order each night.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function listAudioFiles(audioDir: string): string[] {
  return readdirSync(audioDir)
    .filter((f) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(f))
    .map((f) => resolve(join(audioDir, f)))
    .sort();
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Writes a concat playlist file and returns its path. The list is shuffled so
 * the rotation differs nightly; FFmpeg loops the whole list with -stream_loop.
 */
export function buildPlaylist(audioDir: string, outPath: string): { path: string; count: number } {
  const files = shuffle(listAudioFiles(audioDir));
  if (files.length === 0) throw new Error(`No audio files found in ${audioDir}`);

  // concat demuxer format; escape single quotes in paths.
  const body = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
  writeFileSync(outPath, body, "utf8");
  return { path: outPath, count: files.length };
}
