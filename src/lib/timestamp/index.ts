/**
 * ライブ配信タイムスタンプの取得ロジック（GDR-DOM-001）。
 * 一次ソースは「実時刻 − 配信開始時刻」。YouTube 非依存の純関数として実装する。
 */

export type TimestampSource = "clock";

export interface TimestampRecord {
  videoId: string;
  /** 配信開始基準の経過秒（offsetSec 適用後、0 以上） */
  elapsedSec: number;
  /** 記録時の実時刻（Date.now(), ms） */
  capturedAt: number;
  /** 配信開始時刻（ISO 8601） */
  streamStartAt: string;
  /** 適用した遅延補正（秒）。負値で「少し前」を指す */
  offsetSec: number;
  source: TimestampSource;
  note?: string;
}

/** YouTube 依存の情報を供給するインターフェース。content script 側で実装する */
export interface StreamInfoProvider {
  videoId(): string | null;
  streamStartAt(): string | null;
  now(): number;
}

export type TimestampErrorReason = "videoId unavailable" | "streamStartAt unavailable";

export class TimestampError extends Error {
  constructor(readonly reason: TimestampErrorReason) {
    super(reason);
    this.name = "TimestampError";
  }
}

export function captureTimestamp(p: StreamInfoProvider, offsetSec = 0): TimestampRecord {
  const videoId = p.videoId();
  if (!videoId) throw new TimestampError("videoId unavailable");

  const streamStartAt = p.streamStartAt();
  const startMs = streamStartAt ? Date.parse(streamStartAt) : NaN;
  if (!streamStartAt || !Number.isFinite(startMs)) {
    throw new TimestampError("streamStartAt unavailable");
  }

  const capturedAt = p.now();
  const elapsedSec = Math.max(0, (capturedAt - startMs) / 1000 + offsetSec);
  return { videoId, elapsedSec, capturedAt, streamStartAt, offsetSec, source: "clock" };
}

/** 経過秒を YouTube のコメント / チャプターで使える `h:mm:ss` 形式にする */
export function formatElapsed(sec: number): string {
  const total = Math.floor(Math.max(0, sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
