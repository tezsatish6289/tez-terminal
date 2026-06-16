# FNONINJA social media assets

Branded profile photos and banners for each platform, sized to **recommended upload dimensions**.

**Tagline:** Option-chain analytics for NSE F&O

## Regenerate

```bash
npx tsx scripts/build-fnoninja-social-assets.ts
```

## Files

| Platform | File | Size | Use |
|----------|------|------|-----|
| Twitter / X | `twitter/profile-400x400.png` | 400×400 | Profile photo |
| Twitter / X | `twitter/banner-1500x500.png` | 1500×500 | Cover / banner — Header image (3:1). Keep key text away from bottom-left (avatar overlap on mobile). |
| Facebook | `facebook/profile-320x320.png` | 320×320 | Profile photo — Page profile photo. Displays circular; upload square. |
| Facebook | `facebook/cover-820x312.png` | 820×312 | Cover / banner — Page cover photo. Safe zone: center; logo overlaps bottom-left on mobile. |
| LinkedIn | `linkedin/profile-400x400.png` | 400×400 | Profile photo |
| LinkedIn | `linkedin/banner-1584x396.png` | 1584×396 | Cover / banner — Cover 1584×396. Branding centered right of profile-photo overlap (~220px left). |
| YouTube | `youtube/profile-800x800.png` | 800×800 | Profile photo — Channel icon. Displays circular. |
| YouTube | `youtube/banner-2560x1440.png` | 2560×1440 | Cover / banner — Channel art 2560×1440. Logo + wordmark + tagline centered in 1546×423 safe area. |
| Instagram | `instagram/profile-320x320.png` | 320×320 | Profile photo — Profile photo only — Instagram has no profile banner. Displays as a circle. |
| Reddit | `reddit/profile-256x256.png` | 256×256 | Profile photo |
| Reddit | `reddit/banner-1920x384.png` | 1920×384 | Cover / banner — Profile banner (5:1). Avatar overlaps bottom-left. |

## Notes

- **Instagram** has no profile banner — only `profile-320x320.png` is provided.
- **LinkedIn** cover keeps logo + wordmark + tagline **right of the profile-photo zone** (220px inset) and vertically centered in 1584×396.
- **YouTube** channel art is 2560×1440; **all branding sits in the centered 1546×423 safe area** so mobile/desktop crops stay intact. Outer areas are decorative only.
- **Twitter / X, Facebook, Reddit:** same wide-banner safe layout — avatar overlaps bottom-left; branding is inset and centered in the remaining area.
- Profile images render as **circles** on most platforms; artwork is centered on a square canvas.

## Brand colors

- Background: `#070d1a`
- Logo blue: `#3b82f6`
- Accent: `#60a5fa`
- Text: `#f0f4ff`
