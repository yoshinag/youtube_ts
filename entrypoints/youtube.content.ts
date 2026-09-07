import { captureTimestamp, formatElapsed, TimestampError } from "../src/lib/timestamp";
import { createDocumentProvider, findVideo, seekableEnd } from "../src/lib/timestamp/youtube";
import { behindLive, clampSeek, isSkipStep } from "../src/lib/player";
import {
  isCaptureRequest, isFrameRequest, isInfoRequest, isSkipRequest,
  type CaptureResult, type FrameResult, type InfoResult, type SkipResult,
} from "../src/lib/messages";
import { appendRecord, settingsItem } from "../src/ext/storage";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isCaptureRequest(message)) {
        capture().then(sendResponse);
        return true; // 非同期応答
      }
      if (isInfoRequest(message)) {
        sendResponse(info());
      } else if (isSkipRequest(message)) {
        sendResponse(skip(message.deltaSec));
      } else if (isFrameRequest(message)) {
        frame().then(sendResponse);
        return true;
      }
    });
  },
});

function info(): InfoResult {
  const p = createDocumentProvider();
  return {
    type: "info:result",
    videoId: p.videoId(),
    title: p.title(),
    channel: p.channel(),
    hasStreamStart: p.streamStartAt() != null,
    hasVideo: findVideo() != null,
  };
}

async function capture(): Promise<CaptureResult> {
  try {
    const { offsetSec } = await settingsItem.getValue();
    const p = createDocumentProvider();
    const record = captureTimestamp(p, offsetSec);
    const { records, duplicate, pruned } = await appendRecord(record, { title: p.title(), channel: p.channel() });
    const count = records.length;
    if (duplicate) console.info(`[yt-ts] ${formatElapsed(record.elapsedSec)} は直前の記録と重複のため無視`);
    else console.info(`[yt-ts] ${formatElapsed(record.elapsedSec)} を記録（${count} 件目${pruned ? `、古い ${pruned} 件を削除` : ""}${record.behindLiveSec != null ? `、ライブより ${record.behindLiveSec.toFixed(1)} 秒前` : ""}）`);
    return { type: "capture:result", ok: true, record, count, duplicate, pruned };
  } catch (e) {
    const error = e instanceof TimestampError ? e.reason : "unknown";
    console.warn("[yt-ts] 記録に失敗:", e);
    return { type: "capture:result", ok: false, error };
  }
}

/** GDR-DOM-002: `<video>` の currentTime を直接加減算する */
function skip(deltaSec: number): SkipResult {
  if (!isSkipStep(deltaSec)) return { type: "skip:result", ok: false, error: "invalid step" };
  const v = findVideo();
  if (!v) return { type: "skip:result", ok: false, error: "video unavailable" };
  const end = seekableEnd(v);
  v.currentTime = clampSeek(v.currentTime + deltaSec, end);
  return { type: "skip:result", ok: true, currentTime: v.currentTime, behindLiveSec: behindLive(end, v.currentTime) };
}

/** GDR-DOM-002: 現在フレームを PNG の data URL にする。経過秒は記録と同じ計算（VOD なら currentTime） */
async function frame(): Promise<FrameResult> {
  const v = findVideo();
  if (!v) return { type: "frame:result", ok: false, error: "video unavailable" };
  if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || v.videoWidth === 0) {
    return { type: "frame:result", ok: false, error: "frame unavailable" };
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const p = createDocumentProvider();
    let elapsedSec: number;
    try {
      const { offsetSec } = await settingsItem.getValue();
      elapsedSec = captureTimestamp(p, offsetSec).elapsedSec;
    } catch {
      elapsedSec = v.currentTime; // 配信開始時刻が無い（VOD 等）
    }
    return { type: "frame:result", ok: true, dataUrl, width: canvas.width, height: canvas.height, videoId: p.videoId(), elapsedSec };
  } catch (e) {
    console.warn("[yt-ts] フレーム取得に失敗:", e); // DRM 等で canvas が汚染された場合
    return { type: "frame:result", ok: false, error: "frame unavailable" };
  }
}
