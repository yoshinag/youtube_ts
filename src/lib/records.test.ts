import { appendRecordPure, normalizeOffset, removeRecord, toExportJson, updateRecord } from "./records";
import type { TimestampRecord } from "./timestamp";

const rec = (over: Partial<TimestampRecord> & { id: string }): TimestampRecord => ({
  videoId: "vid00000001",
  elapsedSec: 60,
  capturedAt: 1_000_000,
  streamStartAt: "2026-08-24T00:00:00Z",
  offsetSec: 0,
  source: "clock",
  ...over,
});

describe("appendRecordPure", () => {
  it("通常は末尾に追加し、入力配列を変更しない", () => {
    const base = [rec({ id: "a" })];
    const r = appendRecordPure(base, rec({ id: "b", capturedAt: 1_010_000 }));
    expect(r).toEqual({ records: [base[0], expect.objectContaining({ id: "b" })], duplicate: false, pruned: 0 });
    expect(base).toHaveLength(1);
  });

  it("同一動画で 1.5 秒未満の連打は重複として捨てる", () => {
    const base = [rec({ id: "a", capturedAt: 1_000_000 })];
    const r = appendRecordPure(base, rec({ id: "b", capturedAt: 1_001_499 }));
    expect(r.duplicate).toBe(true);
    expect(r.records).toHaveLength(1);
    expect(appendRecordPure(base, rec({ id: "c", capturedAt: 1_001_500 })).duplicate).toBe(false);
  });

  it("重複判定は同一動画の最後のレコードと比較する（末尾が別動画でも）", () => {
    const base = [rec({ id: "a", capturedAt: 1_000_000 }), rec({ id: "x", videoId: "other000001", capturedAt: 1_000_500 })];
    expect(appendRecordPure(base, rec({ id: "b", capturedAt: 1_001_000 })).duplicate).toBe(true);
    expect(appendRecordPure(base, rec({ id: "c", capturedAt: 1_002_000 })).duplicate).toBe(false);
  });

  it("上限を超えたら古い順に削除し件数を返す", () => {
    const base = [rec({ id: "a", capturedAt: 1 }), rec({ id: "b", capturedAt: 10_000 })];
    const r = appendRecordPure(base, rec({ id: "c", capturedAt: 20_000 }), { maxRecords: 2 });
    expect(r.pruned).toBe(1);
    expect(r.records.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("removeRecord", () => {
  it("id で 1 件削除する", () => {
    expect(removeRecord([rec({ id: "a" }), rec({ id: "b" })], "a").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("toExportJson", () => {
  it("version / exportedAt / records を含む", () => {
    const json = JSON.parse(toExportJson([rec({ id: "a" })], new Date("2026-08-24T12:00:00Z")));
    expect(json).toEqual({ version: 2, exportedAt: "2026-08-24T12:00:00.000Z", records: [expect.objectContaining({ id: "a" })] });
  });
});

describe("updateRecord", () => {
  it("note を更新し、前後の空白を除く。他のレコードは触らない", () => {
    const base = [rec({ id: "a" }), rec({ id: "b" })];
    const out = updateRecord(base, "a", { note: "  ここ神 " });
    expect(out[0]?.note).toBe("ここ神");
    expect(out[1]).toBe(base[1]);
  });

  it("空文字なら note キーを削除する", () => {
    const out = updateRecord([rec({ id: "a", note: "x" })], "a", { note: "  " });
    expect(out[0]).not.toHaveProperty("note");
  });
});

describe("normalizeOffset", () => {
  it.each([
    ["5", 5],
    [-3.6, -4],
    ["abc", 0],
    [999, 600],
    [-999, -600],
  ])("%s → %s", (input, expected) => {
    expect(normalizeOffset(input)).toBe(expected);
  });
});
