/** Desktop replay row width (matches carousel basis ~20%). */
export const DESKTOP_REPLAY_COLUMNS = 5;

export function replayColumnCount(viewportWidth: number): number {
  return viewportWidth >= 1024 ? DESKTOP_REPLAY_COLUMNS : 1;
}
