"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const easeOut = [0.25, 0.46, 0.45, 0.94] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOut },
  },
};

export const fadeScale: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease: easeOut },
  },
};

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: easeOut },
  },
};

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: 36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: easeOut },
  },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.12 },
  },
};

const heroStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.08 },
  },
};

type BoxProps = {
  children: ReactNode;
  className?: string;
  variants?: Variants;
};

export function Reveal({ children, className, variants = fadeUp }: BoxProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: Omit<BoxProps, "variants">) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, variants = fadeUp }: BoxProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

/** Above-the-fold mount stagger (not scroll-triggered). */
export function HeroStagger({ children, className }: Omit<BoxProps, "variants">) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" animate="visible" variants={heroStagger}>
      {children}
    </motion.div>
  );
}

export function HeroItem({ children, className, variants = fadeUp }: BoxProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

/** Single element that animates once on mount (above the fold). */
export function MountReveal({ children, className, variants = fadeUp }: BoxProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" animate="visible" variants={variants}>
      {children}
    </motion.div>
  );
}

/** Horizontal progress line that fills when scrolled into view. */
export function RevealLine({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className} style={{ transformOrigin: "left center" }} />;
  }
  return (
    <motion.div
      className={className}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
      style={{ transformOrigin: "left center" }}
    />
  );
}
