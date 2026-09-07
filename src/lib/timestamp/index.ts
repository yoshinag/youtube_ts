/**
 * ライブ配信タイムスタンプの取得ロジック（GDR-DOM-001）。
 * 一次ソースは「実時刻 − 配信開始時刻」。GDR-DOM-002 でライブ端からの遅れ（behindLiveSec）を引き、再生位置に追従させる。
 * 配信中でない動画（アーカイブ / 通常動画）は再生位置そのものを経過秒にする（GDR-DOM-003, source: "position"）。
 * YouTube 非依存の純関数として実装する。
 */

/** "clock": 実時刻 − 配信開始（ライブ中） / "position": video.currentTime（アーカイブ・通常動画） */
export type TimestampSource = "clock" | "position";

export interface TimestampRecord {
  /** 一意 ID（GDR-STORE-001, v2 で追加） */
  id: string;
  videoId: string;
  /** 配信開始基準の経過秒（offsetSec 適用後、0 以上） */
  elapsedSec: number;
  /** 記録時の実時刻（Date.now(), ms） */
  capturedAt: number;
  /** 配信開始時刻（ISO 8601）。通常動画など無い場合は null */
  streamStartAt: string | null;
  /** 適用した遅延補正（秒）。負値で「少し前」を指す。position では常に 0 */
  offsetSec: number;
  source: TimestampSource;
  note?: string;
  /** 記録時のライブ端からの遅れ（秒）。取得できたときだけ持つ（GDR-DOM-002）。省略時は 0 扱い */
  behindLiveSec?: number;
}

/** YouTube 依存の情報を供給するインターフェース。content script 側で実装する */
export interface StreamInfoProvider {
  videoId(): string | null;
  streamStartAt(): string | null;
  now(): number;
  /** いま配信中か。未実装 / null なら「配信開始時刻があれば配信中」とみなす（GDR-DOM-003） */
  isLiveNow?(): boolean | null;
  /** 再生位置（秒）。配信中でないときの経過秒に使う。取れなければ null */
  currentTime?(): number | null;
  /** ライブ端からの遅れ（秒）。巻き戻し / 一時停止中の再生位置に記録を追従させる（GDR-DOM-002）。不明なら null */
  behindLiveSec?(): number | null;
  /** レコード ID の生成。既定は crypto.randomUUID() */
  newId?(): string;
}

export type TimestampErrorReason = "videoId unavailable" | "streamStartAt unavailable" | "position unavailable";

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
  const capturedAt = p.now();
  const id = p.newId ? p.newId() : crypto.randomUUID();

  // 配信中でなければ再生位置をそのまま経過秒にする（GDR-DOM-003）
  const live = p.isLiveNow ? p.isLiveNow() === true : streamStartAt != null;
  if (!live) {
    const position = p.currentTime?.() ?? null;
    if (position == null || !Number.isFinite(position)) throw new TimestampError("position unavailable");
    return {
      id, videoId, elapsedSec: Math.max(0, position), capturedAt,
      streamStartAt: Number.isFinite(startMs) ? streamStartAt : null, offsetSec: 0, source: "position",
    };
  }

  if (!streamStartAt || !Number.isFinite(startMs)) {
    throw new TimestampError("streamStartAt unavailable");
  }
  const behind = p.behindLiveSec?.() ?? null;
  const elapsedSec = Math.max(0, (capturedAt - startMs) / 1000 - (behind ?? 0) + offsetSec);
  const record: TimestampRecord = { id, videoId, elapsedSec, capturedAt, streamStartAt, offsetSec, source: "clock" };
  if (behind != null) record.behindLiveSec = behind;
  return record;
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
