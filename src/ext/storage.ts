/** records / settings の永続化（GDR-EXT-001 / GDR-STORE-001 v2） */
import { storage } from "wxt/utils/storage";
import type { TimestampRecord } from "../lib/timestamp";
import { appendRecordPure, removeRecord, SCHEMA_VERSION, type AppendResult } from "../lib/records";

export interface Settings {
  /** 視聴遅延の補正（秒）。負値で「少し前」を指す */
  offsetSec: number;
}

type RecordV1 = Omit<TimestampRecord, "id">;

export const recordsItem = storage.defineItem<TimestampRecord[]>("local:records", {
  fallback: [],
  version: SCHEMA_VERSION,
  migrations: {
    // v1（id なし）→ v2。WXT は version メタが無い既存値を v1 とみなす
    2: (old: RecordV1[]) => old.map((r) => ({ ...r, id: crypto.randomUUID() })),
  },
});

export const settingsItem = storage.defineItem<Settings>("local:settings", { fallback: { offsetSec: 0 } });

/** 同一コンテキスト内の書き込みを直列化する */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function appendRecord(record: TimestampRecord): Promise<AppendResult> {
  return serialized(async () => {
    const result = appendRecordPure(await recordsItem.getValue(), record);
    if (!result.duplicate) await recordsItem.setValue(result.records);
    return result;
  });
}

export function deleteRecord(id: string): Promise<void> {
  return serialized(async () => {
    await recordsItem.setValue(removeRecord(await recordsItem.getValue(), id));
  });
}

export function clearRecords(): Promise<void> {
  return serialized(() => recordsItem.setValue([]));
}
