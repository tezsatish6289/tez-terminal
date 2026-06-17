#!/usr/bin/env node
/**
 * Generate a soft, royalty-free ambient music bed (no external assets / licensing).
 * Writes video/public/audio/bgm.wav — a slow evolving pad in A minor, low volume,
 * meant to sit under captions. Swap it for a licensed track any time by replacing
 * this file (keep the name bgm.wav, or change MUSIC_FILE in src/audio.ts).
 *
 * Usage: node scripts/make-music.mjs [seconds]
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SECONDS = Number(process.argv[2] ?? 55);
const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio", "bgm.wav");

// A minor pad: root, fifth, octave, minor third up — gentle, non-dramatic.
const VOICES = [110.0, 164.81, 220.0, 261.63, 329.63];
const N = Math.floor(SECONDS * SR);

const float = new Float32Array(N * 2);
let peak = 0;

for (let i = 0; i < N; i++) {
  const t = i / SR;
  // Global slow swell (0.05 Hz) so it breathes instead of droning flat.
  const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.05 * t - Math.PI / 2);
  let l = 0;
  let r = 0;
  for (let v = 0; v < VOICES.length; v++) {
    const f = VOICES[v];
    // Per-voice slow vibrato + tremolo, staggered phases for movement.
    const vib = 1 + 0.0015 * Math.sin(2 * Math.PI * (0.07 + v * 0.013) * t + v);
    const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * (0.04 + v * 0.017) * t + v * 1.7);
    const w = Math.sin(2 * Math.PI * f * vib * t);
    // Soften higher voices so the low end leads (pad-like balance).
    const g = trem / (1 + v * 0.6);
    // Slight L/R detune for stereo width.
    const wr = Math.sin(2 * Math.PI * f * vib * 1.0008 * t);
    l += w * g;
    r += wr * g;
  }
  // Faint shimmer two octaves up, very low level, slowly panning.
  const sh = Math.sin(2 * Math.PI * 880 * t) * 0.03 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.03 * t));
  l = (l + sh) * swell;
  r = (r - sh) * swell;
  float[i * 2] = l;
  float[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}

// Normalize to a quiet bed (-16 dBFS ≈ 0.16) and apply 1.5s in / 3s out fades.
const target = 0.16;
const norm = peak > 0 ? target / peak : 1;
const fadeIn = Math.floor(1.5 * SR);
const fadeOut = Math.floor(3 * SR);
const pcm = Buffer.alloc(N * 2 * 2);
for (let i = 0; i < N; i++) {
  let env = 1;
  if (i < fadeIn) env = i / fadeIn;
  else if (i > N - fadeOut) env = Math.max(0, (N - i) / fadeOut);
  for (let ch = 0; ch < 2; ch++) {
    let s = float[i * 2 + ch] * norm * env;
    s = Math.max(-1, Math.min(1, s));
    pcm.writeInt16LE((s * 32767) | 0, (i * 2 + ch) * 2);
  }
}

// WAV header (44 bytes, 16-bit stereo PCM).
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(2, 22); // stereo
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2 * 2, 28); // byte rate
header.writeUInt16LE(2 * 2, 32); // block align
header.writeUInt16LE(16, 34); // bits
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, pcm]));
console.log(`[music] wrote ${OUT} (${SECONDS}s, ${(pcm.length / 1e6).toFixed(1)}MB PCM)`);
