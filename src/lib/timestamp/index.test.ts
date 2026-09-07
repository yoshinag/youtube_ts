import { captureTimestamp, formatElapsed, TimestampError, type StreamInfoProvider } from "./index";

const START = "2026-08-24T10:00:00+09:00";
const startMs = Date.parse(START);

function provider(over: Partial<StreamInfoProvider> = {}): StreamInfoProvider {
  return {
    videoId: () => "abc123XYZ_-",
    streamStartAt: () => START,
    now: () => startMs + 90_000, // 1 分 30 秒後
    newId: () => "id-1",
    ...over,
  };
}

describe("captureTimestamp", () => {
  it("実時刻 − 配信開始時刻を経過秒として記録する", () => {
    const r = captureTimestamp(provider());
    expect(r).toEqual({
      id: "id-1",
      videoId: "abc123XYZ_-",
      elapsedSec: 90,
      capturedAt: startMs + 90_000,
      streamStartAt: START,
      offsetSec: 0,
      source: "clock",
    });
  });

  it("newId 未指定なら crypto.randomUUID() で採番する", () => {
    const r = captureTimestamp(provider({ newId: undefined }));
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("offsetSec を加算し、負の補正も適用する", () => {
    expect(captureTimestamp(provider(), -15).elapsedSec).toBe(75);
    expect(captureTimestamp(provider(), 5).elapsedSec).toBe(95);
    expect(captureTimestamp(provider(), 5).offsetSec).toBe(5);
  });

  it("behindLiveSec（ライブ端からの遅れ）を引き、レコードにも残す（GDR-DOM-002）", () => {
    const r = captureTimestamp(provider({ behindLiveSec: () => 30 }), -5);
    expect(r.elapsedSec).toBe(55);
    expect(r.behindLiveSec).toBe(30);
  });

  it("behindLiveSec が null / 未定義なら 0 扱いでフィールドも持たない", () => {
    expect(captureTimestamp(provider({ behindLiveSec: () => null })).elapsedSec).toBe(90);
    expect(captureTimestamp(provider({ behindLiveSec: () => null }))).not.toHaveProperty("behindLiveSec");
    expect(captureTimestamp(provider())).not.toHaveProperty("behindLiveSec");
  });

  it("配信中でなければ再生位置を経過秒にする（GDR-DOM-003, source: position。補正は適用しない）", () => {
    const r = captureTimestamp(provider({ isLiveNow: () => false, currentTime: () => 3902.3 }), -10);
    expect(r).toEqual({
      id: "id-1", videoId: "abc123XYZ_-", elapsedSec: 3902.3, capturedAt: startMs + 90_000,
      streamStartAt: START, offsetSec: 0, source: "position",
    });
  });

  it("通常動画（配信開始時刻なし・isLiveNow null）も再生位置で記録し streamStartAt は null", () => {
    const r = captureTimestamp(provider({ isLiveNow: () => null, streamStartAt: () => null, currentTime: () => 12 }));
    expect(r.source).toBe("position");
    expect(r.elapsedSec).toBe(12);
    expect(r.streamStartAt).toBeNull();
  });

  it("配信中でなく再生位置も取れなければ position unavailable", () => {
    expect(() => captureTimestamp(provider({ isLiveNow: () => false, currentTime: () => null }))).toThrow("position unavailable");
    expect(() => captureTimestamp(provider({ isLiveNow: () => false }))).toThrow("position unavailable");
  });

  it("isLiveNow が true なら従来どおり実時刻基準（currentTime は使わない）", () => {
    const r = captureTimestamp(provider({ isLiveNow: () => true, currentTime: () => 5 }));
    expect(r.source).toBe("clock");
    expect(r.elapsedSec).toBe(90);
  });

  it("経過秒は 0 未満にならない", () => {
    expect(captureTimestamp(provider(), -120).elapsedSec).toBe(0);
    expect(captureTimestamp(provider({ now: () => startMs - 1000 })).elapsedSec).toBe(0);
  });

  it("videoId が無ければ TimestampError を投げる", () => {
    expect(() => captureTimestamp(provider({ videoId: () => null }))).toThrow(TimestampError);
    expect(() => captureTimestamp(provider({ videoId: () => "" }))).toThrow("videoId unavailable");
  });

  it("配信開始時刻が不正な ISO なら TimestampError を投げる（推測値で埋めない）", () => {
    expect(() => captureTimestamp(provider({ streamStartAt: () => "not-a-date" }))).toThrow("streamStartAt unavailable");
  });

  it("配信開始時刻も再生位置も無ければ TimestampError を投げる", () => {
    expect(() => captureTimestamp(provider({ streamStartAt: () => null }))).toThrow("position unavailable");
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
