/** レコード集合に対する純関数（GDR-STORE-001）。WXT 非依存 */
import type { TimestampRecord } from "./timestamp";

export const SCHEMA_VERSION = 2;
export const DEDUP_WINDOW_MS = 1500;
export const MAX_RECORDS = 5000;

export interface AppendOptions {
  dedupWindowMs?: number;
  maxRecords?: number;
}

export interface AppendResult {
  records: TimestampRecord[];
  /** 連打とみなして捨てた場合 true（records は入力と同一） */
  duplicate: boolean;
  /** 上限超過で古い順に削除した件数 */
  pruned: number;
}

/** 重複排除と上限を適用して追記する。入力配列は変更しない */
export function appendRecordPure(
  records: readonly TimestampRecord[],
  record: TimestampRecord,
  opts: AppendOptions = {},
): AppendResult {
  const dedupWindowMs = opts.dedupWindowMs ?? DEDUP_WINDOW_MS;
  const maxRecords = opts.maxRecords ?? MAX_RECORDS;

  const last = findLastForVideo(records, record.videoId);
  if (last && Math.abs(record.capturedAt - last.capturedAt) < dedupWindowMs) {
    return { records: [...records], duplicate: true, pruned: 0 };
  }

  const next = [...records, record];
  const pruned = Math.max(0, next.length - maxRecords);
  return { records: pruned ? next.slice(pruned) : next, duplicate: false, pruned };
}

function findLastForVideo(records: readonly TimestampRecord[], videoId: string): TimestampRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i]?.videoId === videoId) return records[i];
  }
  return undefined;
}

export function removeRecord(records: readonly TimestampRecord[], id: string): TimestampRecord[] {
  return records.filter((r) => r.id !== id);
}

export interface ExportJson {
  version: number;
  exportedAt: string;
  records: TimestampRecord[];
}

export function toExportJson(records: readonly TimestampRecord[], now: Date = new Date()): string {
  const payload: ExportJson = { version: SCHEMA_VERSION, exportedAt: now.toISOString(), records: [...records] };
  return JSON.stringify(payload, null, 2);
}

/** note 等の部分更新。note が空文字 / undefined ならキーごと削除する */
export function updateRecord(
  records: readonly TimestampRecord[],
  id: string,
  patch: Partial<Pick<TimestampRecord, "note">>,
): TimestampRecord[] {
  return records.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    if (!next.note?.trim()) delete next.note;
    else next.note = next.note.trim();
    return next;
  });
}

export const OFFSET_MIN_SEC = -600;
export const OFFSET_MAX_SEC = 600;

/** 入力値を補正秒として正規化（NaN → 0、範囲外は clamp、整数化） */
export function normalizeOffset(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(OFFSET_MAX_SEC, Math.max(OFFSET_MIN_SEC, Math.round(n)));
}
