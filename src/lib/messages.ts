/** 拡張内メッセージの型定義（GDR-EXT-001 / GDR-STORE-001）。WXT 非依存 */
import type { TimestampRecord, TimestampErrorReason } from "./timestamp";

export type CaptureRequest = { type: "capture" };

export type CaptureResult =
  | {
      type: "capture:result";
      ok: true;
      record: TimestampRecord;
      /** 保存後の総件数 */
      count: number;
      /** 連打とみなして保存しなかった場合 true */
      duplicate: boolean;
      /** 上限超過で削除した古い記録の件数 */
      pruned: number;
    }
  | { type: "capture:result"; ok: false; error: TimestampErrorReason | "unknown" };

export type InfoRequest = { type: "info" };

export type InfoResult = {
  type: "info:result";
  videoId: string | null;
  title: string | null;
  channel: string | null;
  /** 記録の方式。"live" = 実時刻基準（配信中）/ "vod" = 再生位置（アーカイブ・通常動画）/ null = 記録不可（GDR-DOM-003） */
  mode: "live" | "vod" | null;
  /** `<video>` があり、スキップ / スクショが可能なページか（GDR-DOM-002） */
  hasVideo: boolean;
};

// ---- GDR-DOM-002: スキップ / フレーム取得（popup → content script）

export type SkipRequest = { type: "skip"; deltaSec: number };

export type SkipResult =
  | { type: "skip:result"; ok: true; currentTime: number; behindLiveSec: number | null }
  | { type: "skip:result"; ok: false; error: "video unavailable" | "invalid step" };

export type FrameRequest = { type: "frame" };

/** スクショと同時に残した記録（配信開始時刻が無い VOD 等では null） */
export type FrameRecorded = { record: TimestampRecord; count: number; duplicate: boolean; pruned: number };

export type FrameResult =
  | {
      type: "frame:result";
      ok: true;
      dataUrl: string;
      width: number;
      height: number;
      /** `screenshotFilename` で作ったファイル名（ディレクトリなし）。記録の note と一致する */
      filename: string;
      recorded: FrameRecorded | null;
    }
  | { type: "frame:result"; ok: false; error: "video unavailable" | "frame unavailable" };

// ---- GDR-EXT-002: スクリーンショット保存（popup → background）

export type ScreenshotRequest = { type: "screenshot"; tabId: number };

export type ScreenshotResult =
  | { type: "screenshot:result"; ok: true; filename: string; downloadId: number; recorded: FrameRecorded | null }
  | { type: "screenshot:result"; ok: false; error: string };

export type Message =
  | CaptureRequest | CaptureResult | InfoRequest | InfoResult
  | SkipRequest | SkipResult | FrameRequest | FrameResult | ScreenshotRequest | ScreenshotResult;

function hasType(m: unknown, type: string): boolean {
  return typeof m === "object" && m !== null && (m as { type?: unknown }).type === type;
}

export function isCaptureRequest(m: unknown): m is CaptureRequest {
  return hasType(m, "capture");
}

export function isInfoRequest(m: unknown): m is InfoRequest {
  return hasType(m, "info");
}

export function isSkipRequest(m: unknown): m is SkipRequest {
  return hasType(m, "skip") && typeof (m as SkipRequest).deltaSec === "number";
}

export function isFrameRequest(m: unknown): m is FrameRequest {
  return hasType(m, "frame");
}

export function isScreenshotRequest(m: unknown): m is ScreenshotRequest {
  return hasType(m, "screenshot") && typeof (m as ScreenshotRequest).tabId === "number";
}
