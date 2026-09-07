import { parseIsLiveNow, parseStreamStartAt, parseVideoDetails, parseVideoId, titleFromDocument } from "./youtube";

const START = "2026-08-24T01:00:00+00:00";
const playerResponse = (extra = "") =>
  JSON.stringify({
    videoDetails: { videoId: "dQw4w9WgXcQ", title: 'He said "hi"; then {left}' },
    microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true, startTimestamp: START } } },
    ...(extra ? { extra } : {}),
  });

describe("parseStreamStartAt", () => {
  it("var 宣言形式の script から startTimestamp を取り出す", () => {
    const script = `var ytInitialPlayerResponse = ${playerResponse()};var meta = {};`;
    expect(parseStreamStartAt(script)).toBe(START);
  });

  it("window.ytInitialPlayerResponse 形式にも対応する", () => {
    expect(parseStreamStartAt(`window.ytInitialPlayerResponse = ${playerResponse()};`)).toBe(START);
  });

  it("JSON 中の引用符・セミコロン・波括弧に惑わされない", () => {
    const script = `var ytInitialPlayerResponse = ${playerResponse("a;b}c")};</script>`;
    expect(parseStreamStartAt(script)).toBe(START);
  });

  it("liveBroadcastDetails が無ければ null（通常動画）", () => {
    const script = `var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: "x" } })};`;
    expect(parseStreamStartAt(script)).toBeNull();
  });

  it("無関係な script / 壊れた JSON / 不正な日時は null", () => {
    expect(parseStreamStartAt("var foo = 1;")).toBeNull();
    expect(parseStreamStartAt("var ytInitialPlayerResponse = {broken;")).toBeNull();
    const bad = JSON.stringify({ microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { startTimestamp: "soon" } } } });
    expect(parseStreamStartAt(`var ytInitialPlayerResponse = ${bad};`)).toBeNull();
  });
});

describe("parseIsLiveNow", () => {
  const wrap = (o: unknown) => `var ytInitialPlayerResponse = ${JSON.stringify(o)};`;
  it("liveBroadcastDetails.isLiveNow を返す（配信中 / アーカイブ）", () => {
    expect(parseIsLiveNow(`var ytInitialPlayerResponse = ${playerResponse()};`)).toBe(true);
    const archived = { microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: false, startTimestamp: START, endTimestamp: START } } } };
    expect(parseIsLiveNow(wrap(archived))).toBe(false);
  });
  it("無ければ videoDetails.isLive、それも無ければ null（通常動画）", () => {
    expect(parseIsLiveNow(wrap({ videoDetails: { isLive: true } }))).toBe(true);
    expect(parseIsLiveNow(wrap({ videoDetails: { videoId: "x" } }))).toBeNull();
    expect(parseIsLiveNow("var foo = 1;")).toBeNull();
  });
});

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?t=10&v=dQw4w9WgXcQ&list=PL1", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/", null],
    ["https://www.youtube.com/watch?v=short", null],
    ["not a url", null],
  ])("%s → %s", (url, expected) => {
    expect(parseVideoId(url)).toBe(expected);
  });
});

describe("parseStreamStartAt（堅牢性）", () => {
  it("終端に `;` が無くても、後続に別の代入があっても取り出せる", () => {
    const script = `window.ytInitialPlayerResponse = ${playerResponse()}\nvar ytInitialData = {"a":"b"};`;
    expect(parseStreamStartAt(script)).toBe(START);
  });

  it("似た名前の変数（myytInitialPlayerResponse）には反応しない", () => {
    expect(parseStreamStartAt(`var myytInitialPlayerResponse = ${playerResponse()};`)).toBeNull();
  });

  it("文字列内のエスケープされた引用符 \\\" を越えて正しく閉じる", () => {
    const script = `var ytInitialPlayerResponse = ${playerResponse('say \\"}\\" ok')};`;
    expect(parseStreamStartAt(script)).toBe(START);
  });
});

describe("parseVideoDetails", () => {
  it("videoId / title / author を取り出す", () => {
    const script = `var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: "dQw4w9WgXcQ", title: "24時間耐久", author: "ch" } })};`;
    expect(parseVideoDetails(script)).toEqual({ videoId: "dQw4w9WgXcQ", title: "24時間耐久", author: "ch" });
  });

  it("title が無ければ null、author が無ければ null を返す", () => {
    expect(parseVideoDetails(`var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: "x" } })};`)).toBeNull();
    const noAuthor = `var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: "x", title: "t" } })};`;
    expect(parseVideoDetails(noAuthor)?.author).toBeNull();
  });
});

describe("titleFromDocument", () => {
  it.each([
    ["24時間耐久 - YouTube", "24時間耐久"],
    ["A - B - YouTube", "A - B"],
    ["  - YouTube", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(titleFromDocument(input)).toBe(expected);
  });
});
