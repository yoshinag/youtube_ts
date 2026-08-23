import type { CaptureRequest, CaptureResult } from "../src/lib/messages";

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "capture-timestamp" || tab?.id == null) return;
    const tabId = tab.id;
    try {
      const req: CaptureRequest = { type: "capture" };
      const res = (await browser.tabs.sendMessage(tabId, req)) as CaptureResult | undefined;
      if (res?.ok) {
        await browser.action.setBadgeText({ tabId, text: res.duplicate ? "=" : String(res.count) });
      } else {
        await browser.action.setBadgeText({ tabId, text: "!" });
      }
    } catch {
      // content script 未注入のタブ（YouTube 以外 / リロード前）。無視する
    }
  });
});
