import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import { toExportJson } from "../../src/lib/records";
import { groupRecordsByStream, toExportText, type StreamGroup, type StreamMap } from "../../src/lib/streams";
import type { CaptureRequest, CaptureResult, InfoRequest, InfoResult } from "../../src/lib/messages";
import {
  clearRecords, deleteRecord, deleteStream, patchRecord, recordsItem, saveOffset, settingsItem, streamsItem,
} from "../../src/ext/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLDivElement>("list");
const count = $<HTMLSpanElement>("count");
const empty = $<HTMLParagraphElement>("empty");
const status = $<HTMLDivElement>("status");
const captureBtn = $<HTMLButtonElement>("capture");
const offsetInput = $<HTMLInputElement>("offset");

let records: TimestampRecord[] = [];
let streams: StreamMap = {};
let current: { videoId: string; title: string | null; channel: string | null } | null = null;
let activeTabId: number | undefined;
let editingId: string | null = null;
let dirtyWhileEditing = false;
const openState = new Map<string, boolean>();

// ---- 描画 ----------------------------------------------------------------

function render() {
  if (editingId != null) {
    dirtyWhileEditing = true;
    return;
  }
  const groups = groupRecordsByStream(records, streams, current);
  list.replaceChildren(...groups.map(renderGroup));
  count.textContent = String(records.length);
  empty.hidden = groups.length > 0;
}

function renderGroup(g: StreamGroup): HTMLDetailsElement {
  const details = document.createElement("details");
  details.open = openState.get(g.meta.videoId) ?? g.current;
  details.addEventListener("toggle", () => openState.set(g.meta.videoId, details.open));
  if (g.current) details.classList.add("current");

  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.className = g.placeholder ? "title placeholder" : "title";
  title.textContent = g.placeholder ? `${g.meta.videoId}（タイトル未取得）` : g.meta.title;
  title.title = [g.meta.title, g.meta.channel, g.meta.videoId].filter(Boolean).join("\n");
  summary.append(title);
  if (g.current) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "現在";
    summary.append(badge);
  }
  const meta = document.createElement("small");
  meta.textContent = g.records.length ? `${g.records.length} 件 · ${dateLabel(g.meta.lastCapturedAt)}` : "0 件";
  summary.append(meta);

  const ops = document.createElement("span");
  ops.className = "ops";
  ops.append(
    button("コピー", "この配信の一覧をコピー", async (e) => {
      e.preventDefault();
      if (!g.records.length) return flash("記録がありません");
      await navigator.clipboard.writeText(toExportText(g.records, streams));
      flash(`${g.records.length} 件をコピーしました`);
    }),
    button("削除", "この配信の記録をすべて削除", async (e) => {
      e.preventDefault();
      if (!g.records.length) return;
      if (confirm(`『${g.meta.title}』の ${g.records.length} 件を削除しますか？`)) await deleteStream(g.meta.videoId);
    }, "danger"),
  );
  summary.append(ops);
  details.append(summary);

  const ul = document.createElement("ul");
  if (g.records.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent = "まだ記録がありません。「● 記録」または Alt+Shift+T で記録できます。";
    ul.append(li);
  } else {
    ul.append(...[...g.records].reverse().map(renderRow));
  }
  details.append(ul);
  return details;
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
  meta.textContent = new Date(r.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const del = document.createElement("button");
  del.className = "del";
  del.title = "この記録を削除";
  del.textContent = "×";
  del.addEventListener("click", () => deleteRecord(r.id));

  li.append(a, note, meta, del);
  return li;
}

function button(label: string, title: string, onClick: (e: MouseEvent) => void, cls = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

function dateLabel(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "numeric", day: "numeric" });
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
    if (dirtyWhileEditing) await reload();
    dirtyWhileEditing = false;
    render();
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

function flash(message: string) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2500);
}

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

async function reload() {
  [records, streams] = await Promise.all([recordsItem.getValue(), streamsItem.getValue()]);
}

(async () => {
  const [settings] = await Promise.all([settingsItem.getValue(), detectActiveTab(), reload()]);
  offsetInput.value = String(settings.offsetSec);
  render();
  recordsItem.watch(async () => { await reload(); render(); });
  streamsItem.watch(async () => { await reload(); render(); });
})();
