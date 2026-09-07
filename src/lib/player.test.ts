import { behindLive, clampSeek, formatTenths, isSkipStep, screenshotFilename, MAX_BEHIND_LIVE_SEC } from "./player";

describe("isSkipStep", () => {
  it("±0.1 / 1 / 10 / 30 / 60 / 300 だけを受け付ける", () => {
    for (const d of [0.1, -0.1, 1, -1, 10, -10, 30, -30, 60, -60, 300, -300]) expect(isSkipStep(d)).toBe(true);
    for (const d of [0, 5, -5, 0.5, 120, NaN, Infinity]) expect(isSkipStep(d)).toBe(false);
  });
});

describe("behindLive", () => {
  it("seekable.end − currentTime を返す", () => {
    expect(behindLive(1000, 967.6)).toBeCloseTo(32.4);
    expect(behindLive(1000, 1000)).toBe(0);
  });
  it("取れない / 範囲外は null", () => {
    expect(behindLive(null, 10)).toBeNull();
    expect(behindLive(NaN, 10)).toBeNull();
    expect(behindLive(Infinity, 10)).toBeNull();
    expect(behindLive(10, NaN)).toBeNull();
    expect(behindLive(10, 20)).toBeNull(); // 負
    expect(behindLive(MAX_BEHIND_LIVE_SEC + 1, 0)).toBeNull();
    expect(behindLive(MAX_BEHIND_LIVE_SEC, 0)).toBe(MAX_BEHIND_LIVE_SEC);
  });
});

describe("clampSeek", () => {
  it("[0, seekableEnd] に収める", () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(50, 100)).toBe(50);
    expect(clampSeek(150, 100)).toBe(100);
  });
  it("seekableEnd が無ければ下限だけ", () => {
    expect(clampSeek(150, null)).toBe(150);
    expect(clampSeek(-1, null)).toBe(0);
  });
});

describe("formatTenths", () => {
  it.each([
    [0, "0:00:00.0"],
    [3902.3, "1:05:02.3"],
    [59.96, "0:01:00.0"],
    [-3, "0:00:00.0"],
  ])("%s → %s", (sec, expected) => {
    expect(formatTenths(sec)).toBe(expected);
  });
});

describe("screenshotFilename", () => {
  const date = new Date(2026, 8, 8, 21, 30, 45);
  it("日時_videoId_経過.png", () => {
    expect(screenshotFilename("dQw4w9WgXcQ", 3902.3, date)).toBe("20260908-213045_dQw4w9WgXcQ_1h05m02.3s.png");
  });
  it("videoId が無ければ novideo", () => {
    expect(screenshotFilename(null, 0, date)).toBe("20260908-213045_novideo_0h00m00.0s.png");
  });
});
