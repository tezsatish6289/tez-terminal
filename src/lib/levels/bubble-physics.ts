import type { BubbleTone } from "@/lib/zones/bubble-tone";

/** Minimal fields needed for layout + simulation. */
export interface BubblePhysicsItem {
  id: string;
  scope: "index" | "stock";
  tone: BubbleTone;
}

/** Index circles are always the largest on the map (easy to spot). */
const INDEX_BUBBLE_RADIUS = 84;
const STOCK_RADIUS = {
  unscanned: 26,
  neutral: 30,
  near: 40,
  inZone: 48,
} as const;

export function bubbleRadius(scope: "index" | "stock", tone: BubbleTone): number {
  if (scope === "index") return INDEX_BUBBLE_RADIUS;
  if (tone === "UNSCANNED") return STOCK_RADIUS.unscanned;
  if (tone === "ILLIQUID" || tone === "NEUTRAL") return STOCK_RADIUS.neutral;
  if (tone === "IN_BULL" || tone === "IN_BEAR") return STOCK_RADIUS.inZone;
  if (tone === "NEAR_BULL" || tone === "NEAR_BEAR") return STOCK_RADIUS.near;
  return STOCK_RADIUS.neutral;
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
export interface PackBubblesOptions {
  radiusScale?: number;
  mobileEmbed?: boolean;
}

export function layoutBubbleRadius(
  scope: "index" | "stock",
  tone: BubbleTone,
  radiusScale = 1,
  mobileEmbed = false,
): number {
  const base = bubbleRadius(scope, tone);
  if (!mobileEmbed) return base * radiusScale;
  if (scope === "index") return base * radiusScale * 0.42;
  if (isInZoneTone(tone) || isNearZoneTone(tone)) return base * radiusScale * 0.98;
  return base * radiusScale * 0.48;
}

export function packBubbles<T extends BubblePhysicsItem>(
  items: T[],
  width: number,
  height: number,
  options: PackBubblesOptions = {},
): { item: T; x: number; y: number; r: number }[] {
  const { radiusScale = 1, mobileEmbed = false } = options;
  if (width < 40 || height < 40 || items.length === 0) return [];

  const sorted = [...items]
    .map((item) => ({
      item,
      r: layoutBubbleRadius(item.scope, item.tone, radiusScale, mobileEmbed),
    }))
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
  const relaxIters = mobileEmbed ? 72 : 48;
  for (let iter = 0; iter < relaxIters; iter++) {
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

  if (mobileEmbed) {
    const cx = width / 2;
    const cy = height / 2;
    const zoneNodes = nodes.filter(
      (n) =>
        n.item.scope === "stock" &&
        (isInZoneTone(n.item.tone) || isNearZoneTone(n.item.tone)),
    );
    zoneNodes.forEach((n, i) => {
      const spread = Math.min(width, height) * 0.22;
      const t = zoneNodes.length <= 1 ? 0 : (i / (zoneNodes.length - 1)) * 2 - 1;
      n.x = cx + t * spread;
      n.y = cy - height * 0.06;
    });
    const indexNodes = nodes.filter((n) => n.item.scope === "index");
    indexNodes.forEach((n, i) => {
      const span = width - n.r * 2 - 24;
      const t = indexNodes.length <= 1 ? 0.5 : i / (indexNodes.length - 1);
      n.x = 12 + n.r + span * t;
      n.y = height - n.r - 14;
    });
    for (let iter = 0; iter < 32; iter++) {
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
  }

  return nodes;
}

export function createPhysicsNodes<T extends BubblePhysicsItem>(
  items: T[],
  width: number,
  height: number,
  existing?: Map<string, PhysicsNode<T>>,
  options: PackBubblesOptions = {},
): PhysicsNode<T>[] {
  const packed = packBubbles(items, width, height, options);
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

/** Gentle drift, wall bounce, soft collisions — tuned for slow float (not pinball). */
export function stepPhysics(
  nodes: PhysicsNode[],
  width: number,
  height: number,
  intensity = 1,
): void {
  if (width < 40 || height < 40 || nodes.length === 0 || intensity <= 0) return;

  const edgePad = 10;
  const collidePad = 6;
  const damp = 0.996 - (1 - intensity) * 0.012;
  const maxSpeed = 0.14 * intensity;
  const drift = 0.00028 * intensity;

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
      n.vx = Math.abs(n.vx) * 0.35 + 0.012;
    }
    if (n.x + n.r > width - edgePad) {
      n.x = width - edgePad - n.r;
      n.vx = -Math.abs(n.vx) * 0.35 - 0.012;
    }
    if (n.y - n.r < edgePad) {
      n.y = edgePad + n.r;
      n.vy = Math.abs(n.vy) * 0.35 + 0.012;
    }
    if (n.y + n.r > height - edgePad) {
      n.y = height - edgePad - n.r;
      n.vy = -Math.abs(n.vy) * 0.35 - 0.012;
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
        const push = (minDist - dist) * 0.1;
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
          const impulse = impact * 0.06;
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

export function isNearZoneTone(tone: BubbleTone): boolean {
  return tone === "NEAR_BULL" || tone === "NEAR_BEAR";
}

/** Paint order: zone setups above indices and neutral/unscanned stocks. */
export function bubbleStackZIndex(scope: "index" | "stock", tone: BubbleTone): number {
  switch (tone) {
    case "IN_BULL":
    case "IN_BEAR":
      return scope === "index" ? 210 : 200;
    case "NEAR_BULL":
    case "NEAR_BEAR":
      return scope === "index" ? 170 : 160;
    case "NEUTRAL":
    case "ILLIQUID":
      return scope === "index" ? 90 : 50;
    case "UNSCANNED":
    default:
      return scope === "index" ? 70 : 25;
  }
}
