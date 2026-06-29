export interface NewsSource {
  title: string;
  url: string;
}

export interface NewsCaptions {
  twitter: string;
  facebook: string;
  linkedin: string;
  instagram: string;
}

export interface NewsDraft {
  /** Short factual headline (used on the image overlay + as the content label). */
  headline: string;
  /** Plain-language research brief for human review before posting. */
  summary: string;
  /** Grounding sources Gemini used (for the reviewer to sanity-check). */
  sources: NewsSource[];
  /** Per-platform captions (X, Facebook, LinkedIn, Instagram). */
  captions: NewsCaptions;
  /** Prompt handed to the image model for the background art. */
  imagePrompt: string;
}
