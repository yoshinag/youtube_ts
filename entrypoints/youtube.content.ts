import { captureTimestamp, formatElapsed, TimestampError } from "../src/lib/timestamp";
import { createDocumentProvider } from "../src/lib/timestamp/youtube";
import { isCaptureRequest, type CaptureResult } from "../src/lib/messages";
import { appendRecord, settingsItem } from "../src/ext/storage";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isCaptureRequest(message)) return;
      capture().then(sendResponse);
      return true; // 非同期応答
    });
  },
});

async function capture(): Promise<CaptureResult> {
  try {
    const { offsetSec } = await settingsItem.getValue();
    const record = captureTimestamp(createDocumentProvider(), offsetSec);
    const { records, duplicate, pruned } = await appendRecord(record);
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
