import type { BubbleTone } from "@/lib/zones/bubble-tone";

/** Minimal fields needed for layout + simulation. */
export interface BubblePhysicsItem {
  id: string;
  scope: "index" | "stock";
  tone: BubbleTone;
}

export function bubbleRadius(scope: "index" | "stock", tone: BubbleTone): number {
  if (tone === "UNSCANNED") return 30;
  if (tone === "ILLIQUID") return scope === "index" ? 36 : 28;
  if (tone === "NEUTRAL") return scope === "index" ? 44 : 34;
  if (scope === "index") return tone === "IN_BULL" || tone === "IN_BEAR" ? 78 : 64;
  if (tone === "IN_BULL" || tone === "IN_BEAR") return 52;
  return 44;
}

export interface PhysicsNode<T extends BubblePhysicsItem = BubblePhysicsItem> {
  id: string;
  item: T;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Golden-angle spiral + collision relaxation for initial layout. */
export function packBubbles<T extends BubblePhysicsItem>(
  items: T[],
  width: number,
  height: number,
): { item: T; x: number; y: number; r: number }[] {
  if (width < 40 || height < 40 || items.length === 0) return [];

  const sorted = [...items]
    .map((item) => ({ item, r: bubbleRadius(item.scope, item.tone) }))
    .sort((a, b) => b.r - a.r);

  const cx = width / 2;
  const cy = height / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const nodes = sorted.map(({ item, r }, i) => {
    const angle = i * golden;
    const ring = 6 + Math.sqrt(i + 1) * (Math.min(width, height) * 0.11);
    return {
      item,
      r,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
    };
  });

  const pad = 4;
  for (let iter = 0; iter < 48; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.r + b.r + pad;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    for (const n of nodes) {
      n.x = Math.max(n.r + 8, Math.min(width - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(height - n.r - 8, n.y));
    }
  }

  return nodes;
}

export function createPhysicsNodes<T extends BubblePhysicsItem>(
  items: T[],
  width: number,
  height: number,
  existing?: Map<string, PhysicsNode<T>>,
): PhysicsNode<T>[] {
  const packed = packBubbles(items, width, height);
  return packed.map(({ item, x, y, r }) => {
    const prev = existing?.get(item.id);
    return {
      id: item.id,
      item,
      x: prev?.x ?? x,
      y: prev?.y ?? y,
      vx: prev?.vx ?? 0,
      vy: prev?.vy ?? 0,
      r,
    };
  });
}

/** Gentle drift, wall bounce, soft collisions (Banter-style float). */
export function stepPhysics(
  nodes: PhysicsNode[],
  width: number,
  height: number,
  intensity = 1,
): void {
  if (width < 40 || height < 40 || nodes.length === 0 || intensity <= 0) return;

  const edgePad = 10;
  const collidePad = 5;
  const damp = 0.988 - (1 - intensity) * 0.04;
  const maxSpeed = 0.95 * intensity;
  const drift = 0.004 * intensity;

  for (const n of nodes) {
    n.vx += (Math.random() - 0.5) * drift;
    n.vy += (Math.random() - 0.5) * drift;
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > maxSpeed) {
      n.vx = (n.vx / sp) * maxSpeed;
      n.vy = (n.vy / sp) * maxSpeed;
    }
    n.x += n.vx;
    n.y += n.vy;
  }

  for (const n of nodes) {
    if (n.x - n.r < edgePad) {
      n.x = edgePad + n.r;
      n.vx = Math.abs(n.vx) * 0.72 + 0.08;
    }
    if (n.x + n.r > width - edgePad) {
      n.x = width - edgePad - n.r;
      n.vx = -Math.abs(n.vx) * 0.72 - 0.08;
    }
    if (n.y - n.r < edgePad) {
      n.y = edgePad + n.r;
      n.vy = Math.abs(n.vy) * 0.72 + 0.08;
    }
    if (n.y + n.r > height - edgePad) {
      n.y = height - edgePad - n.r;
      n.vy = -Math.abs(n.vy) * 0.72 - 0.08;
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = a.r + b.r + collidePad;
      if (dist < minDist) {
        const push = (minDist - dist) * 0.52;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const impact = relVx * ux + relVy * uy;
        if (impact < 0) {
          const impulse = impact * 0.42;
          a.vx += impulse * ux;
          a.vy += impulse * uy;
          b.vx -= impulse * ux;
          b.vy -= impulse * uy;
        }
      }
    }
  }

  for (const n of nodes) {
    n.vx *= damp;
    n.vy *= damp;
  }
}

export function isInZoneTone(tone: BubbleTone): boolean {
  return tone === "IN_BULL" || tone === "IN_BEAR";
}
