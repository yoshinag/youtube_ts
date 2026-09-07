/**
 * 再生位置のスキップとスクリーンショットに関する純関数（GDR-DOM-002 / GDR-EXT-002）。
 * DOM には触らず数値と文字列だけを扱う。
 */

/** popup のスキップボタンの刻み（秒）。± の 12 種を受け付ける */
export const SKIP_STEPS = [0.1, 1, 10, 30, 60, 300] as const;

/** DVR で遡れる上限（12 時間）。これを超える「ライブ端からの遅れ」は異常値として扱う */
export const MAX_BEHIND_LIVE_SEC = 43_200;

export function isSkipStep(deltaSec: number): boolean {
  return SKIP_STEPS.some((s) => s === Math.abs(deltaSec));
}

/**
 * ライブ端からの遅れ（秒）。`seekable.end − currentTime` が `[0, MAX_BEHIND_LIVE_SEC]` に収まるときだけ返す。
 * 取れない / 範囲外なら null（呼び出し側は 0 とみなす = 実時刻のみの現行動作）
 */
export function behindLive(seekableEnd: number | null, currentTime: number): number | null {
  if (seekableEnd == null || !Number.isFinite(seekableEnd) || !Number.isFinite(currentTime)) return null;
  const v = seekableEnd - currentTime;
  return v >= 0 && v <= MAX_BEHIND_LIVE_SEC ? v : null;
}

/** シーク先を `[0, seekableEnd]` に収める */
export function clampSeek(target: number, seekableEnd: number | null): number {
  const t = Math.max(0, target);
  return seekableEnd != null && Number.isFinite(seekableEnd) ? Math.min(t, seekableEnd) : t;
}

/** 0.1 秒刻みの `h:mm:ss.t`（UI 用） */
export function formatTenths(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const total = Math.floor(tenths / 10);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

/** スクショのファイル名: `20260908-213045_dQw4w9WgXcQ_1h05m02.3s.png`（ローカル時刻） */
export function screenshotFilename(videoId: string | null, elapsedSec: number, date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${p2(date.getMonth() + 1)}${p2(date.getDate())}` +
    `-${p2(date.getHours())}${p2(date.getMinutes())}${p2(date.getSeconds())}`;
  const [h, m, s] = formatTenths(elapsedSec).split(":");
  return `${stamp}_${videoId ?? "novideo"}_${h}h${m}m${s}s.png`;
}
