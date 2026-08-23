import { captureTimestamp, formatElapsed, TimestampError, type StreamInfoProvider } from "./index";

const START = "2026-08-24T10:00:00+09:00";
const startMs = Date.parse(START);

function provider(over: Partial<StreamInfoProvider> = {}): StreamInfoProvider {
  return {
    videoId: () => "abc123XYZ_-",
    streamStartAt: () => START,
    now: () => startMs + 90_000, // 1 分 30 秒後
    ...over,
  };
}

describe("captureTimestamp", () => {
  it("実時刻 − 配信開始時刻を経過秒として記録する", () => {
    const r = captureTimestamp(provider());
    expect(r).toEqual({
      videoId: "abc123XYZ_-",
      elapsedSec: 90,
      capturedAt: startMs + 90_000,
      streamStartAt: START,
      offsetSec: 0,
      source: "clock",
    });
  });

  it("offsetSec を加算し、負の補正も適用する", () => {
    expect(captureTimestamp(provider(), -15).elapsedSec).toBe(75);
    expect(captureTimestamp(provider(), 5).elapsedSec).toBe(95);
    expect(captureTimestamp(provider(), 5).offsetSec).toBe(5);
  });

  it("経過秒は 0 未満にならない", () => {
    expect(captureTimestamp(provider(), -120).elapsedSec).toBe(0);
    expect(captureTimestamp(provider({ now: () => startMs - 1000 })).elapsedSec).toBe(0);
  });

  it("videoId が無ければ TimestampError を投げる", () => {
    expect(() => captureTimestamp(provider({ videoId: () => null }))).toThrow(TimestampError);
    expect(() => captureTimestamp(provider({ videoId: () => "" }))).toThrow("videoId unavailable");
  });

  it("streamStartAt が無い / 不正な ISO なら TimestampError を投げる（推測値で埋めない）", () => {
    expect(() => captureTimestamp(provider({ streamStartAt: () => null }))).toThrow("streamStartAt unavailable");
    expect(() => captureTimestamp(provider({ streamStartAt: () => "not-a-date" }))).toThrow("streamStartAt unavailable");
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [90, "1:30"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3725.9, "1:02:05"],
    [-3, "0:00"],
  ])("%s 秒 → %s", (sec, expected) => {
    expect(formatElapsed(sec)).toBe(expected);
  });
});
