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

export type Message = CaptureRequest | CaptureResult;

export function isCaptureRequest(m: unknown): m is CaptureRequest {
  return typeof m === "object" && m !== null && (m as { type?: unknown }).type === "capture";
}
