import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import { filterByVideo, toExportJson, toExportText } from "../../src/lib/records";
import type { CaptureRequest, CaptureResult, InfoRequest, InfoResult } from "../../src/lib/messages";
import { clearRecords, deleteRecord, patchRecord, recordsItem, saveOffset, settingsItem } from "../../src/ext/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLUListElement>("list");
const count = $<HTMLSpanElement>("count");
const empty = $<HTMLParagraphElement>("empty");
const status = $<HTMLDivElement>("status");
const captureBtn = $<HTMLButtonElement>("capture");
const offsetInput = $<HTMLInputElement>("offset");
const filterLabel = $<HTMLLabelElement>("filter-label");
const filterCheck = $<HTMLInputElement>("filter");

let all: TimestampRecord[] = [];
let currentVideoId: string | null = null;
let activeTabId: number | undefined;
let editingId: string | null = null;
let pending: TimestampRecord[] | null = null;

// ---- 描画 ----------------------------------------------------------------

function visibleRecords(): TimestampRecord[] {
  const useFilter = currentVideoId != null && filterCheck.checked;
  return useFilter ? filterByVideo(all, currentVideoId) : all;
}

function render(records: TimestampRecord[]) {
  if (editingId != null) {
    pending = records;
    return;
  }
  all = records;
  const shown = visibleRecords();
  list.replaceChildren(...[...shown].reverse().map(renderRow));
  count.textContent = shown.length === all.length ? String(all.length) : `${shown.length} / ${all.length}`;
  empty.hidden = shown.length > 0;
  empty.textContent =
    all.length > 0 && shown.length === 0
      ? "この配信の記録はまだありません。"
      : "まだ記録がありません。「● 記録」または Alt+Shift+T で記録できます。";
}

function renderRow(r: TimestampRecord): HTMLLIElement {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = `https://www.youtube.com/watch?v=${r.videoId}&t=${Math.floor(r.elapsedSec)}s`;
  a.target = "_blank";
  a.textContent = formatElapsed(r.elapsedSec);

  const note = document.createElement("span");
  note.className = r.note ? "note" : "note placeholder";
  note.textContent = r.note ?? "メモを追加";
  note.title = "クリックで編集";
  note.addEventListener("click", () => startEdit(r, note));

  const meta = document.createElement("small");
  meta.textContent = currentVideoId === r.videoId && filterCheck.checked ? timeLabel(r) : `${r.videoId} · ${timeLabel(r)}`;

  const del = document.createElement("button");
  del.className = "del";
  del.title = "この記録を削除";
  del.textContent = "×";
  del.addEventListener("click", () => deleteRecord(r.id));

  li.append(a, note, meta, del);
  return li;
}

function timeLabel(r: TimestampRecord): string {
  return new Date(r.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---- note 編集 -----------------------------------------------------------

function startEdit(r: TimestampRecord, host: HTMLSpanElement) {
  if (editingId != null) return;
  editingId = r.id;
  const input = document.createElement("input");
  input.value = r.note ?? "";
  input.placeholder = "メモ";
  host.replaceChildren(input);
  host.classList.remove("placeholder");
  input.focus();

  let done = false;
  const finish = async (save: boolean) => {
    if (done) return;
    done = true;
    if (save && input.value.trim() !== (r.note ?? "")) await patchRecord(r.id, { note: input.value });
    editingId = null;
    const next = pending ?? (await recordsItem.getValue());
    pending = null;
    render(next);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ---- 記録 ----------------------------------------------------------------

async function detectActiveTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
    if (activeTabId == null) throw new Error("no tab");
    const req: InfoRequest = { type: "info" };
    const info = (await browser.tabs.sendMessage(activeTabId, req)) as InfoResult | undefined;
    currentVideoId = info?.videoId ?? null;
    captureBtn.disabled = !info?.hasStreamStart;
    captureBtn.title = info?.hasStreamStart
      ? "現在の配信のタイムスタンプを記録"
      : currentVideoId
        ? "この動画は配信開始時刻が取得できません（ライブ配信ではない、または再読み込みが必要）"
        : "YouTube のライブ配信ページで開いてください";
  } catch {
    currentVideoId = null;
    captureBtn.disabled = true;
    captureBtn.title = "YouTube のライブ配信ページで開いてください（拡張更新後はページの再読み込みが必要）";
  }
  filterLabel.hidden = currentVideoId == null;
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

filterCheck.addEventListener("change", () => render(all));

function flash(message: string) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2500);
}

$("copy").addEventListener("click", async () => {
  const target = visibleRecords();
  if (target.length === 0) return flash("記録がありません");
  await navigator.clipboard.writeText(toExportText(target));
  flash(`${target.length} 件をコピーしました`);
});

$("export").addEventListener("click", () => {
  if (all.length === 0) return flash("記録がありません");
  const blob = new Blob([toExportJson(all)], { type: "application/json" });
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
  const [settings] = await Promise.all([settingsItem.getValue(), detectActiveTab()]);
  offsetInput.value = String(settings.offsetSec);
  render(await recordsItem.getValue());
  recordsItem.watch((records) => render(records ?? []));
})();
