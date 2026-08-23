/** records / settings の永続化（GDR-EXT-001 / GDR-STORE-001 v2） */
import { storage } from "wxt/utils/storage";
import type { TimestampRecord } from "../lib/timestamp";
import { appendRecordPure, normalizeOffset, removeRecord, SCHEMA_VERSION, updateRecord, type AppendResult } from "../lib/records";
import { dropOrphanStreams, upsertStream, type StreamInfo, type StreamMap } from "../lib/streams";

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

/** 配信メタ（GDR-STORE-002）。records とは別キーで、records を先に書いて整合を保つ */
export const streamsItem = storage.defineItem<StreamMap>("local:streams", { fallback: {} });

/** 同一コンテキスト内の書き込みを直列化する */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function appendRecord(record: TimestampRecord, info: StreamInfo): Promise<AppendResult> {
  return serialized(async () => {
    const result = appendRecordPure(await recordsItem.getValue(), record);
    if (result.duplicate) return result;
    await recordsItem.setValue(result.records);
    const streams = upsertStream(await streamsItem.getValue(), record, info);
    await streamsItem.setValue(result.pruned ? dropOrphanStreams(streams, result.records) : streams);
    return result;
  });
}

export function deleteRecord(id: string): Promise<void> {
  return serialized(async () => {
    const records = removeRecord(await recordsItem.getValue(), id);
    await recordsItem.setValue(records);
    await streamsItem.setValue(dropOrphanStreams(await streamsItem.getValue(), records));
  });
}

/** 配信単位で記録とメタを削除 */
export function deleteStream(videoId: string): Promise<void> {
  return serialized(async () => {
    const records = (await recordsItem.getValue()).filter((r) => r.videoId !== videoId);
    await recordsItem.setValue(records);
    await streamsItem.setValue(dropOrphanStreams(await streamsItem.getValue(), records));
  });
}

export function patchRecord(id: string, patch: Partial<Pick<TimestampRecord, "note">>): Promise<void> {
  return serialized(async () => {
    await recordsItem.setValue(updateRecord(await recordsItem.getValue(), id, patch));
  });
}

export async function saveOffset(value: unknown): Promise<number> {
  const offsetSec = normalizeOffset(value);
  const current = await settingsItem.getValue();
  await settingsItem.setValue({ ...current, offsetSec });
  return offsetSec;
}

export function clearRecords(): Promise<void> {
  return serialized(async () => {
    await recordsItem.setValue([]);
    await streamsItem.setValue({});
  });
}
