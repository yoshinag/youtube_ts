/** レコード集合に対する純関数（GDR-STORE-001）。WXT 非依存 */
import { formatElapsed, type TimestampRecord } from "./timestamp";

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

/** videoId ごとにグループ化。グループ順は最初の記録の capturedAt 順、行は elapsedSec 昇順 */
export function groupByVideo(records: readonly TimestampRecord[]): Map<string, TimestampRecord[]> {
  const groups = new Map<string, TimestampRecord[]>();
  for (const r of [...records].sort((a, b) => a.capturedAt - b.capturedAt)) {
    const g = groups.get(r.videoId);
    if (g) g.push(r);
    else groups.set(r.videoId, [r]);
  }
  for (const g of groups.values()) g.sort((a, b) => a.elapsedSec - b.elapsedSec);
  return groups;
}

/** YouTube コメント / 概要欄にそのまま貼れるテキスト */
export function toExportText(records: readonly TimestampRecord[]): string {
  const blocks: string[] = [];
  for (const [videoId, rs] of groupByVideo(records)) {
    const lines = rs.map((r) => (r.note ? `${formatElapsed(r.elapsedSec)} ${r.note}` : formatElapsed(r.elapsedSec)));
    blocks.push([`# ${videoId}`, ...lines].join("\n"));
  }
  return blocks.join("\n\n");
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
