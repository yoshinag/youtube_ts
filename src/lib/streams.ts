/** 配信メタ（GDR-STORE-002）に対する純関数。WXT 非依存 */
import { formatElapsed, type TimestampRecord } from "./timestamp";

export interface StreamMeta {
  videoId: string;
  title: string;
  channel: string | null;
  /** 配信開始時刻（ISO 8601）。通常動画は null */
  streamStartAt: string | null;
  firstCapturedAt: number;
  lastCapturedAt: number;
}

export type StreamMap = Record<string, StreamMeta>;

export interface StreamInfo {
  title: string | null;
  channel: string | null;
}

/** 記録時に配信メタを upsert。first は保持、last は更新、title / channel は取得できたときだけ上書き */
export function upsertStream(streams: StreamMap, record: TimestampRecord, info: StreamInfo): StreamMap {
  const prev = streams[record.videoId];
  const next: StreamMeta = {
    videoId: record.videoId,
    title: info.title ?? prev?.title ?? record.videoId,
    channel: info.channel ?? prev?.channel ?? null,
    streamStartAt: record.streamStartAt ?? prev?.streamStartAt ?? null,
    firstCapturedAt: prev ? Math.min(prev.firstCapturedAt, record.capturedAt) : record.capturedAt,
    lastCapturedAt: prev ? Math.max(prev.lastCapturedAt, record.capturedAt) : record.capturedAt,
  };
  return { ...streams, [record.videoId]: next };
}

/** 記録が 1 件もない配信のメタを除去 */
export function dropOrphanStreams(streams: StreamMap, records: readonly TimestampRecord[]): StreamMap {
  const live = new Set(records.map((r) => r.videoId));
  return Object.fromEntries(Object.entries(streams).filter(([id]) => live.has(id)));
}

export interface StreamGroup {
  meta: StreamMeta;
  /** elapsedSec 昇順 */
  records: TimestampRecord[];
  /** メタが無く videoId から仮生成したもの */
  placeholder: boolean;
  current: boolean;
}

/**
 * 配信ごとにグループ化。並びは lastCapturedAt 降順、現在の配信は先頭固定。
 * メタの無い配信は videoId をタイトルにした仮メタで補う。記録の無い配信（現在の配信を含む）はグループにしない（GDR-UI-005）。
 */
export function groupRecordsByStream(
  records: readonly TimestampRecord[],
  streams: StreamMap,
  current: { videoId: string; title: string | null; channel: string | null } | null,
): StreamGroup[] {
  const byVideo = new Map<string, TimestampRecord[]>();
  for (const r of records) {
    const g = byVideo.get(r.videoId);
    if (g) g.push(r);
    else byVideo.set(r.videoId, [r]);
  }

  const groups: StreamGroup[] = [];
  for (const [videoId, rs] of byVideo) {
    rs.sort((a, b) => a.elapsedSec - b.elapsedSec);
    const meta = streams[videoId];
    groups.push({
      meta: meta ?? placeholderMeta(videoId, rs),
      records: rs,
      placeholder: !meta,
      current: current?.videoId === videoId,
    });
  }
  groups.sort((a, b) => b.meta.lastCapturedAt - a.meta.lastCapturedAt);

  // GDR-UI-005: 記録の無い現在の配信は空グループを作らない（先頭固定とタイトル補完だけ）
  if (current) {
    const idx = groups.findIndex((g) => g.current);
    if (idx > 0) {
      const [g] = groups.splice(idx, 1);
      groups.unshift(g!);
    }
    const head = groups[0];
    if (head?.current && head.placeholder && current.title) {
      // 旧記録のみの配信を今開いている → info のタイトルで表示だけ補う
      head.meta = { ...head.meta, title: current.title, channel: current.channel };
      head.placeholder = false;
    }
  }
  return groups;
}

function placeholderMeta(videoId: string, rs: readonly TimestampRecord[]): StreamMeta {
  const times = rs.map((r) => r.capturedAt);
  return {
    videoId,
    title: videoId,
    channel: null,
    streamStartAt: rs[0]?.streamStartAt ?? null,
    firstCapturedAt: Math.min(...times),
    lastCapturedAt: Math.max(...times),
  };
}

/** YouTube コメント / 概要欄にそのまま貼れるテキスト。配信ごとに見出し + URL + 行 */
export function toExportText(records: readonly TimestampRecord[], streams: StreamMap): string {
  return groupRecordsByStream(records, streams, null)
    .map((g) => {
      const lines = g.records.map((r) => (r.note ? `${formatElapsed(r.elapsedSec)} ${r.note}` : formatElapsed(r.elapsedSec)));
      return [`# ${g.meta.title}`, `https://www.youtube.com/watch?v=${g.meta.videoId}`, ...lines].join("\n");
    })
    .join("\n\n");
}
