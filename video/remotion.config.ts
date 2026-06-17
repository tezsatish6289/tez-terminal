import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 9:16 vertical shorts/reels are encoded H.264; keep CRF tight for crisp charts.
Config.setCodec("h264");
Config.setCrf(18);
