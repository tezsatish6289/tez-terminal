export type WallIntensity = "heavy" | "moderate" | "mild";
export type WallType = "support" | "resistance";

/** Structured payload passed to the caption AI — built programmatically from video data. */
export interface CaptionPayload {
  date: string;
  time: string;
  wallType: WallType;
  stocks: Array<{
    symbol: string;
    levelType: WallIntensity;
    price: string;
  }>;
  website: string;
}

export interface VideoCaptionOutput {
  twitter: string;
  facebook: string;
  linkedin: string;
  youtubeTitle: string;
  youtubeDescription: string;
  instagram: string;
}

/** Flat shape the admin UI consumes (YouTube title + description merged for the list). */
export interface VideoCaptionsForUi {
  twitter: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  instagram: string;
  youtubeTitle: string;
  youtubeDescription: string;
}

export function captionsForUi(output: VideoCaptionOutput): VideoCaptionsForUi {
  return {
    twitter: output.twitter,
    facebook: output.facebook,
    linkedin: output.linkedin,
    youtube: `TITLE:\n${output.youtubeTitle}\n\nDESCRIPTION:\n${output.youtubeDescription}`,
    instagram: output.instagram,
    youtubeTitle: output.youtubeTitle,
    youtubeDescription: output.youtubeDescription,
  };
}
