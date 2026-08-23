import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import { toExportJson, toExportText } from "../../src/lib/records";
import { clearRecords, deleteRecord, recordsItem } from "../../src/ext/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLUListElement>("list");
const count = $<HTMLSpanElement>("count");
const empty = $<HTMLParagraphElement>("empty");
const status = $<HTMLDivElement>("status");

let current: TimestampRecord[] = [];

function render(records: TimestampRecord[]) {
  current = records;
  list.replaceChildren(
    ...[...records].reverse().map((r) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `https://www.youtube.com/watch?v=${r.videoId}&t=${Math.floor(r.elapsedSec)}s`;
      a.target = "_blank";
      a.textContent = formatElapsed(r.elapsedSec);
      const meta = document.createElement("small");
      meta.textContent = `${r.videoId} · ${new Date(r.capturedAt).toLocaleString()}${r.note ? ` · ${r.note}` : ""}`;
      const del = document.createElement("button");
      del.className = "del";
      del.title = "この記録を削除";
      del.textContent = "×";
      del.addEventListener("click", () => deleteRecord(r.id));
      li.append(a, meta, del);
      return li;
    }),
  );
  count.textContent = String(records.length);
  empty.hidden = records.length > 0;
}

function flash(message: string) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2000);
}

$("copy").addEventListener("click", async () => {
  if (current.length === 0) return flash("記録がありません");
  await navigator.clipboard.writeText(toExportText(current));
  flash("コピーしました");
});

$("export").addEventListener("click", () => {
  if (current.length === 0) return flash("記録がありません");
  const blob = new Blob([toExportJson(current)], { type: "application/json" });
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

recordsItem.getValue().then(render);
recordsItem.watch((records) => render(records ?? []));
