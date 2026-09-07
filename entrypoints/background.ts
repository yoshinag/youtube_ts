import {
  isScreenshotRequest,
  type CaptureRequest, type CaptureResult, type FrameRequest, type FrameResult, type ScreenshotResult,
} from "../src/lib/messages";
import { screenshotFilename } from "../src/lib/player";

/** スクショの保存先（ダウンロードフォルダ配下のサブフォルダ。GDR-EXT-002） */
const SCREENSHOT_DIR = "ss";

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command, tab) => {
    if (tab?.id == null) return;
    const tabId = tab.id;
    try {
      if (command === "capture-timestamp") {
        const req: CaptureRequest = { type: "capture" };
        const res = (await browser.tabs.sendMessage(tabId, req)) as CaptureResult | undefined;
        if (res?.ok) {
          await browser.action.setBadgeText({ tabId, text: res.duplicate ? "=" : String(res.count) });
        } else {
          await browser.action.setBadgeText({ tabId, text: "!" });
        }
      } else if (command === "capture-screenshot") {
        const res = await screenshot(tabId);
        await flashBadge(tabId, res.ok ? "SS" : "!");
      }
    } catch {
      // content script 未注入のタブ（YouTube 以外 / リロード前）。無視する
    }
  });

  // popup からのスクショ要求。保存は background に集約する（GDR-EXT-002）
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isScreenshotRequest(message)) {
      screenshot(message.tabId).then(sendResponse);
      return true;
    }
  });
});

/** content script からフレームを受け取り、`Downloads/ss/` に PNG で保存する */
async function screenshot(tabId: number): Promise<ScreenshotResult> {
  let f: FrameResult | undefined;
  try {
    const req: FrameRequest = { type: "frame" };
    f = (await browser.tabs.sendMessage(tabId, req)) as FrameResult | undefined;
  } catch {
    return { type: "screenshot:result", ok: false, error: "no response" };
  }
  if (!f?.ok) return { type: "screenshot:result", ok: false, error: f?.error ?? "no response" };
  const filename = `${SCREENSHOT_DIR}/${screenshotFilename(f.videoId, f.elapsedSec, new Date())}`;
  try {
    const downloadId = await browser.downloads.download({ url: f.dataUrl, filename, conflictAction: "uniquify", saveAs: false });
    console.info(`[yt-ts] ${filename} を保存（${f.width}×${f.height}）`);
    return { type: "screenshot:result", ok: true, filename, downloadId };
  } catch (e) {
    console.warn("[yt-ts] スクショの保存に失敗:", e);
    return { type: "screenshot:result", ok: false, error: e instanceof Error ? e.message : "download failed" };
  }
}

/** バッジを 1.5 秒だけ差し替えて元に戻す */
async function flashBadge(tabId: number, text: string) {
  const prev = await browser.action.getBadgeText({ tabId });
  await browser.action.setBadgeText({ tabId, text });
  setTimeout(() => void browser.action.setBadgeText({ tabId, text: prev }), 1500);
}
