import { dropOrphanStreams, groupRecordsByStream, toExportText, upsertStream, type StreamMap } from "./streams";
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

describe("upsertStream", () => {
  it("新規ならメタを作る。title が無ければ videoId を仮タイトルにする", () => {
    const s = upsertStream({}, rec({ id: "a" }), { title: null, channel: null });
    expect(s["vid00000001"]).toEqual({
      videoId: "vid00000001", title: "vid00000001", channel: null,
      streamStartAt: "2026-08-24T00:00:00Z", firstCapturedAt: 1_000_000, lastCapturedAt: 1_000_000,
    });
  });

  it("既存なら first を保持し last を更新、title は取得できたときだけ上書き", () => {
    let s = upsertStream({}, rec({ id: "a", capturedAt: 100 }), { title: "旧", channel: "ch" });
    s = upsertStream(s, rec({ id: "b", capturedAt: 200 }), { title: null, channel: null });
    expect(s["vid00000001"]).toMatchObject({ title: "旧", channel: "ch", firstCapturedAt: 100, lastCapturedAt: 200 });
    s = upsertStream(s, rec({ id: "c", capturedAt: 300 }), { title: "新", channel: null });
    expect(s["vid00000001"]).toMatchObject({ title: "新", channel: "ch", lastCapturedAt: 300 });
  });
});

describe("dropOrphanStreams", () => {
  it("記録のない配信を除去する", () => {
    const streams: StreamMap = {
      a: { videoId: "a", title: "A", channel: null, streamStartAt: "", firstCapturedAt: 0, lastCapturedAt: 0 },
      b: { videoId: "b", title: "B", channel: null, streamStartAt: "", firstCapturedAt: 0, lastCapturedAt: 0 },
    };
    expect(Object.keys(dropOrphanStreams(streams, [rec({ id: "1", videoId: "b" })]))).toEqual(["b"]);
  });
});

describe("groupRecordsByStream", () => {
  const records = [
    rec({ id: "1", videoId: "vid00000001", elapsedSec: 300, capturedAt: 1_000 }),
    rec({ id: "2", videoId: "vid00000002", elapsedSec: 10, capturedAt: 5_000 }),
    rec({ id: "3", videoId: "vid00000001", elapsedSec: 20, capturedAt: 2_000 }),
  ];
  const streams: StreamMap = {
    vid00000002: { videoId: "vid00000002", title: "二番目", channel: "ch", streamStartAt: "", firstCapturedAt: 5_000, lastCapturedAt: 5_000 },
  };

  it("lastCapturedAt 降順、行は elapsedSec 昇順、メタ無しは仮メタ", () => {
    const g = groupRecordsByStream(records, streams, null);
    expect(g.map((x) => x.meta.title)).toEqual(["二番目", "vid00000001"]);
    expect(g[1]?.placeholder).toBe(true);
    expect(g[1]?.records.map((r) => r.id)).toEqual(["3", "1"]);
  });

  it("現在の配信は先頭固定され、info のタイトルで仮メタを補う", () => {
    const g = groupRecordsByStream(records, streams, { videoId: "vid00000001", title: "今の配信", channel: null });
    expect(g[0]).toMatchObject({ current: true, placeholder: false, meta: { title: "今の配信" } });
  });

  it("現在の配信に記録が無ければ空グループを作らない（GDR-UI-005）", () => {
    const g = groupRecordsByStream(records, streams, { videoId: "vid00000009", title: "新規", channel: null });
    expect(g).toHaveLength(2);
    expect(g.every((x) => !x.current)).toBe(true);
    expect(groupRecordsByStream([], {}, { videoId: "vid00000009", title: "新規", channel: null })).toEqual([]);
  });

  it("記録があっても現在の配信でなければタイトル補完しない", () => {
    const g = groupRecordsByStream(records, streams, { videoId: "vid00000009", title: "別", channel: null });
    expect(g[1]).toMatchObject({ placeholder: true, meta: { title: "vid00000001" } });
  });
});

describe("toExportText", () => {
  it("配信ごとにタイトル見出し + URL + 行", () => {
    const records = [rec({ id: "1", elapsedSec: 754 }), rec({ id: "2", elapsedSec: 3905, capturedAt: 1_000_100, note: "ここ神" })];
    const streams: StreamMap = {
      vid00000001: { videoId: "vid00000001", title: "24時間耐久", channel: null, streamStartAt: "", firstCapturedAt: 0, lastCapturedAt: 0 },
    };
    expect(toExportText(records, streams)).toBe(
      ["# 24時間耐久", "https://www.youtube.com/watch?v=vid00000001", "12:34", "1:05:05 ここ神"].join("\n"),
    );
  });
});
