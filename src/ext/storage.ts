/** records / settings の永続化（GDR-EXT-001）。スキーマ詳細は GDR-STORE-001 で確定 */
import { storage } from "wxt/utils/storage";
import type { TimestampRecord } from "../lib/timestamp";

export interface Settings {
  /** 視聴遅延の補正（秒）。負値で「少し前」を指す */
  offsetSec: number;
}

export const recordsItem = storage.defineItem<TimestampRecord[]>("local:records", { fallback: [] });
export const settingsItem = storage.defineItem<Settings>("local:settings", { fallback: { offsetSec: 0 } });

/** 追記して総件数を返す。read-modify-write の競合は GDR-STORE-001 の検討課題 */
export async function appendRecord(record: TimestampRecord): Promise<number> {
  const records = await recordsItem.getValue();
  records.push(record);
  await recordsItem.setValue(records);
  return records.length;
}
