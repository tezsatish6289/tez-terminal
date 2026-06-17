export type FnoNinjaSocialPlatform = "x" | "instagram" | "youtube" | "linkedin" | "facebook";

export interface FnoNinjaSocialLink {
  platform: FnoNinjaSocialPlatform;
  href: string;
  label: string;
}

/** Public FNONINJA social profiles — used on the marketing site. */
export const FNONINJA_SOCIAL_LINKS: readonly FnoNinjaSocialLink[] = [
  {
    platform: "x",
    href: "https://x.com/freedombotai",
    label: "Follow FNO NINJA on X",
  },
  {
    platform: "instagram",
    href: "https://www.instagram.com/fnoninja/",
    label: "Follow FNO NINJA on Instagram",
  },
  {
    platform: "youtube",
    href: "https://www.youtube.com/@fnoninja",
    label: "Subscribe to FNO NINJA on YouTube",
  },
  {
    platform: "linkedin",
    href: "https://www.linkedin.com/company/fno-ninja/",
    label: "Follow FNO NINJA on LinkedIn",
  },
  {
    platform: "facebook",
    href: "https://www.facebook.com/profile.php?id=61590760055502",
    label: "Follow FNO NINJA on Facebook",
  },
] as const;
