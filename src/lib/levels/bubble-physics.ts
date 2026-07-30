import type { BubbleTone } from "@/lib/zones/bubble-tone";

/** Minimal fields needed for layout + simulation. */
export interface BubblePhysicsItem {
  id: string;
  scope: "index" | "stock";
  tone: BubbleTone;
  kind?: "mmi" | "flash_sale" | "affiliate";
}

/** Index circles are always the largest on the map (easy to spot). */
const INDEX_BUBBLE_RADIUS = 84;
/** MMI gauge needs a bit more room than a plain index label. */
const MMI_BUBBLE_RADIUS = 96;
/** Flash-sale promo bubble — similar weight to MMI so it reads as a CTA. */
const FLASH_SALE_BUBBLE_RADIUS = 92;
/** Refer & Earn cash bubble — gold-coin CTA weight. */
const AFFILIATE_BUBBLE_RADIUS = 94;
const STOCK_RADIUS = {
  unscanned: 26,
  neutral: 30,
  atPoc: 38,
  near: 40,
  inZone: 48,
} as const;

export function bubbleRadius(
  scope: "index" | "stock",
  tone: BubbleTone,
  kind?: "mmi" | "flash_sale" | "affiliate",
): number {
  if (kind === "mmi") return MMI_BUBBLE_RADIUS;
  if (kind === "flash_sale") return FLASH_SALE_BUBBLE_RADIUS;
  if (kind === "affiliate") return AFFILIATE_BUBBLE_RADIUS;
  if (scope === "index") return INDEX_BUBBLE_RADIUS;
  if (tone === "UNSCANNED") return STOCK_RADIUS.unscanned;
  if (tone === "ILLIQUID" || tone === "NEUTRAL") return STOCK_RADIUS.neutral;
  if (tone === "IN_BULL" || tone === "IN_BEAR") return STOCK_RADIUS.inZone;
  if (tone === "NEAR_BULL" || tone === "NEAR_BEAR") return STOCK_RADIUS.near;
  if (tone === "AT_POC") return STOCK_RADIUS.atPoc;
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
  kind?: "mmi" | "flash_sale" | "affiliate",
): number {
  const base = bubbleRadius(scope, tone, kind);
  if (!mobileEmbed) return base * radiusScale;
  if (kind === "mmi" || kind === "flash_sale" || kind === "affiliate") {
    return base * radiusScale * 0.48;
  }
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
      r: layoutBubbleRadius(item.scope, item.tone, radiusScale, mobileEmbed, item.kind),
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
/** Synthetic id for the community-chat bubble on the market map. */
export const CHAT_MAP_BUBBLE_ID = "__community_chat__";

/** Fixed radius — ~30% smaller than original 46px pin. */
export const CHAT_MAP_BUBBLE_RADIUS = 32;

export function createChatMapBubbleNode(
  width: number,
  height: number,
  r = CHAT_MAP_BUBBLE_RADIUS,
): PhysicsNode<BubblePhysicsItem> {
  const node: PhysicsNode<BubblePhysicsItem> = {
    id: CHAT_MAP_BUBBLE_ID,
    item: { id: CHAT_MAP_BUBBLE_ID, scope: "stock", tone: "NEUTRAL" },
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    r,
  };
  pinChatMapBubble(node, width, height);
  return node;
}

/** Anchor chat bubble to the bottom-right of the map canvas. */
export function pinChatMapBubble(
  node: PhysicsNode,
  width: number,
  height: number,
  padding = { x: 18, y: 14 },
): void {
  node.x = width - padding.x - node.r;
  node.y = height - padding.y - node.r;
  node.vx = 0;
  node.vy = 0;
}

/** Push market bubbles away from the pinned chat bubble (chat stays fixed). */
export function repelNodesFromChatBubble(
  nodes: PhysicsNode[],
  chat: PhysicsNode,
  pad = 10,
): void {
  for (const n of nodes) {
    if (n.id === chat.id) continue;
    const dx = n.x - chat.x;
    const dy = n.y - chat.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const minDist = n.r + chat.r + pad;
    if (dist >= minDist) continue;
    const push = minDist - dist;
    const ux = dx / dist;
    const uy = dy / dist;
    n.x += ux * push;
    n.y += uy * push;
    const outward = n.vx * ux + n.vy * uy;
    if (outward < 0) {
      n.vx -= outward * ux;
      n.vy -= outward * uy;
    }
  }
}

export function clampNodesToBounds(
  nodes: PhysicsNode[],
  width: number,
  height: number,
  edgePad = 10,
): void {
  for (const n of nodes) {
    n.x = Math.max(n.r + edgePad, Math.min(width - n.r - edgePad, n.x));
    n.y = Math.max(n.r + edgePad, Math.min(height - n.r - edgePad, n.y));
  }
}

export function bubbleStackZIndex(scope: "index" | "stock", tone: BubbleTone): number {
  switch (tone) {
    case "IN_BULL":
    case "IN_BEAR":
      return scope === "index" ? 210 : 200;
    case "NEAR_BULL":
    case "NEAR_BEAR":
      return scope === "index" ? 170 : 160;
    case "AT_POC":
      return scope === "index" ? 140 : 130;
    case "NEUTRAL":
    case "ILLIQUID":
      return scope === "index" ? 90 : 50;
    case "UNSCANNED":
    default:
      return scope === "index" ? 70 : 25;
  }
}
