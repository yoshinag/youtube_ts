import { captureTimestamp, formatElapsed, TimestampError } from "../src/lib/timestamp";
import { createDocumentProvider } from "../src/lib/timestamp/youtube";
import { isCaptureRequest, isInfoRequest, type CaptureResult, type InfoResult } from "../src/lib/messages";
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
      }
    });
  },
});

function info(): InfoResult {
  const p = createDocumentProvider();
  return { type: "info:result", videoId: p.videoId(), title: p.title(), channel: p.channel(), hasStreamStart: p.streamStartAt() != null };
}

async function capture(): Promise<CaptureResult> {
  try {
    const { offsetSec } = await settingsItem.getValue();
    const p = createDocumentProvider();
    const record = captureTimestamp(p, offsetSec);
    const { records, duplicate, pruned } = await appendRecord(record, { title: p.title(), channel: p.channel() });
    const count = records.length;
    if (duplicate) console.info(`[yt-ts] ${formatElapsed(record.elapsedSec)} は直前の記録と重複のため無視`);
    else console.info(`[yt-ts] ${formatElapsed(record.elapsedSec)} を記録（${count} 件目${pruned ? `、古い ${pruned} 件を削除` : ""}）`);
    return { type: "capture:result", ok: true, record, count, duplicate, pruned };
  } catch (e) {
    const error = e instanceof TimestampError ? e.reason : "unknown";
    console.warn("[yt-ts] 記録に失敗:", e);
    return { type: "capture:result", ok: false, error };
  }
}
