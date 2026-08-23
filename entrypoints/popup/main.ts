/** popup の状態・メッセージング・ストレージ連携。描画は view.ts */
import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import { toExportJson } from "../../src/lib/records";
import { groupRecordsByStream, toExportText, type StreamMap } from "../../src/lib/streams";
import type { CaptureRequest, CaptureResult, InfoRequest, InfoResult } from "../../src/lib/messages";
import {
  clearRecords, deleteRecord, deleteStream, patchRecord, recordsItem, saveOffset, settingsItem, streamsItem,
} from "../../src/ext/storage";
import { mountNoteEditor, renderGroups, type ViewHandlers } from "./view";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLDivElement>("list");
const count = $<HTMLSpanElement>("count");
const empty = $<HTMLParagraphElement>("empty");
const status = $<HTMLDivElement>("status");
const captureBtn = $<HTMLButtonElement>("capture");
const offsetInput = $<HTMLInputElement>("offset");

// ---- 状態 ----------------------------------------------------------------

let records: TimestampRecord[] = [];
let streams: StreamMap = {};
let current: { videoId: string; title: string | null; channel: string | null } | null = null;
let activeTabId: number | undefined;
let editingId: string | null = null;
let dirtyWhileEditing = false;
const openState = new Map<string, boolean>();

async function reload() {
  [records, streams] = await Promise.all([recordsItem.getValue(), streamsItem.getValue()]);
}

function render() {
  if (editingId != null) {
    dirtyWhileEditing = true;
    return;
  }
  const groups = groupRecordsByStream(records, streams, current);
  list.replaceChildren(...renderGroups(groups, handlers));
  count.textContent = String(records.length);
  empty.hidden = groups.length > 0;
}

function flash(message: string) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2500);
}

// ---- view → 状態 ----------------------------------------------------------

const handlers: ViewHandlers = {
  async copyStream(g) {
    if (!g.records.length) return flash("記録がありません");
    await navigator.clipboard.writeText(toExportText(g.records, streams));
    flash(`${g.records.length} 件をコピーしました`);
  },
  async deleteStream(g) {
    if (!g.records.length) return;
    if (confirm(`『${g.meta.title}』の ${g.records.length} 件を削除しますか？`)) await deleteStream(g.meta.videoId);
  },
  deleteRecord(r) {
    void deleteRecord(r.id);
  },
  editNote(r, host) {
    if (editingId != null) return;
    editingId = r.id;
    mountNoteEditor(r, host, async (value) => {
      if (value != null && value.trim() !== (r.note ?? "")) await patchRecord(r.id, { note: value });
      editingId = null;
      if (dirtyWhileEditing) await reload();
      dirtyWhileEditing = false;
      render();
    });
  },
  isOpen: (videoId, fallback) => openState.get(videoId) ?? fallback,
  setOpen: (videoId, open) => void openState.set(videoId, open),
};

// ---- 記録（content script との通信） ----------------------------------------

async function detectActiveTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
    if (activeTabId == null) throw new Error("no tab");
    const req: InfoRequest = { type: "info" };
    const info = (await browser.tabs.sendMessage(activeTabId, req)) as InfoResult | undefined;
    current = info?.videoId ? { videoId: info.videoId, title: info.title, channel: info.channel } : null;
    captureBtn.disabled = !info?.hasStreamStart;
    captureBtn.title = info?.hasStreamStart
      ? "現在の配信のタイムスタンプを記録"
      : current
        ? "この動画は配信開始時刻が取得できません（ライブ配信ではない、または再読み込みが必要）"
        : "YouTube のライブ配信ページで開いてください";
  } catch {
    current = null;
    captureBtn.disabled = true;
    captureBtn.title = "YouTube のライブ配信ページで開いてください（拡張更新後はページの再読み込みが必要）";
  }
}

captureBtn.addEventListener("click", async () => {
  if (activeTabId == null) return;
  captureBtn.disabled = true;
  try {
    const req: CaptureRequest = { type: "capture" };
    const res = (await browser.tabs.sendMessage(activeTabId, req)) as CaptureResult | undefined;
    if (!res) flash("応答がありません。ページを再読み込みしてください");
    else if (!res.ok) flash(`記録できません: ${res.error}`);
    else if (res.duplicate) flash("直前の記録と重複のため無視しました");
    else flash(`${formatElapsed(res.record.elapsedSec)} を記録${res.pruned ? `（古い ${res.pruned} 件を削除）` : ""}`);
    if (res?.ok) await browser.action.setBadgeText({ tabId: activeTabId, text: res.duplicate ? "=" : String(res.count) });
  } finally {
    captureBtn.disabled = false;
  }
});

// ---- 設定・一括操作 --------------------------------------------------------

offsetInput.addEventListener("change", async () => {
  const saved = await saveOffset(offsetInput.value);
  offsetInput.value = String(saved);
  flash(`補正を ${saved} 秒に設定`);
});

$("copy").addEventListener("click", async () => {
  if (records.length === 0) return flash("記録がありません");
  await navigator.clipboard.writeText(toExportText(records, streams));
  flash(`${records.length} 件をコピーしました`);
});

$("export").addEventListener("click", () => {
  if (records.length === 0) return flash("記録がありません");
  const blob = new Blob([toExportJson(records)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube-timestamps-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("clear").addEventListener("click", async () => {
  if (confirm("すべての記録を削除しますか？")) await clearRecords();
});

// ---- 起動 ----------------------------------------------------------------

(async () => {
  const [settings] = await Promise.all([settingsItem.getValue(), detectActiveTab(), reload()]);
  offsetInput.value = String(settings.offsetSec);
  render();
  const onChange = async () => { await reload(); render(); };
  recordsItem.watch(onChange);
  streamsItem.watch(onChange);
})();
