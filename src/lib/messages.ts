/** 拡張内メッセージの型定義（GDR-EXT-001）。WXT 非依存 */
import type { TimestampRecord, TimestampErrorReason } from "./timestamp";

export type CaptureRequest = { type: "capture" };

export type CaptureResult =
  | { type: "capture:result"; ok: true; record: TimestampRecord; count: number }
  | { type: "capture:result"; ok: false; error: TimestampErrorReason | "unknown" };

export type Message = CaptureRequest | CaptureResult;

export function isCaptureRequest(m: unknown): m is CaptureRequest {
  return typeof m === "object" && m !== null && (m as { type?: unknown }).type === "capture";
}
