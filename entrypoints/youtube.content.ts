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
    const count = await appendRecord(record);
    console.info(`[yt-ts] ${formatElapsed(record.elapsedSec)} を記録（${count} 件目）`);
    return { type: "capture:result", ok: true, record, count };
  } catch (e) {
    const error = e instanceof TimestampError ? e.reason : "unknown";
    console.warn("[yt-ts] 記録に失敗:", e);
    return { type: "capture:result", ok: false, error };
  }
}
