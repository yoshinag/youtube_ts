/** popup の描画部。状態を持たず、イベントはコールバックで外に出す */
import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import type { StreamGroup } from "../../src/lib/streams";

export interface ViewHandlers {
  copyStream(g: StreamGroup): void;
  deleteStream(g: StreamGroup): void;
  deleteRecord(r: TimestampRecord): void;
  editNote(r: TimestampRecord, host: HTMLSpanElement): void;
  /** アコーディオンの開閉状態。popup を開いている間だけ保持 */
  isOpen(videoId: string, fallback: boolean): boolean;
  setOpen(videoId: string, open: boolean): void;
}

export function renderGroups(groups: StreamGroup[], h: ViewHandlers): HTMLDetailsElement[] {
  return groups.map((g) => renderGroup(g, h));
}

export function renderGroup(g: StreamGroup, h: ViewHandlers): HTMLDetailsElement {
  const details = el("details", g.current ? "current" : "");
  details.open = h.isOpen(g.meta.videoId, g.current);
  details.addEventListener("toggle", () => h.setOpen(g.meta.videoId, details.open));

  const summary = el("summary");
  const title = el("span", g.placeholder ? "title placeholder" : "title");
  title.textContent = g.placeholder ? `${g.meta.videoId}（タイトル未取得）` : g.meta.title;
  title.title = [g.meta.title, g.meta.channel, g.meta.videoId].filter(Boolean).join("\n");
  summary.append(title);

  if (g.current) {
    const badge = el("span", "badge");
    badge.textContent = "現在";
    summary.append(badge);
  }

  const meta = el("small");
  meta.textContent = `${g.records.length} 件 · ${dateLabel(g.meta.lastCapturedAt)}`;
  summary.append(meta);

  const ops = el("span", "ops");
  ops.append(
    button("コピー", "この配信の一覧をコピー", (e) => { e.preventDefault(); h.copyStream(g); }),
    button("削除", "この配信の記録をすべて削除", (e) => { e.preventDefault(); h.deleteStream(g); }, "danger"),
  );
  summary.append(ops);
  details.append(summary);

  const ul = el("ul");
  ul.append(...[...g.records].reverse().map((r) => renderRow(r, h)));
  details.append(ul);
  return details;
}

export function renderRow(r: TimestampRecord, h: ViewHandlers): HTMLLIElement {
  const li = el("li");

  const a = el("a");
  a.href = `https://www.youtube.com/watch?v=${r.videoId}&t=${Math.floor(r.elapsedSec)}s`;
  a.target = "_blank";
  a.textContent = formatElapsed(r.elapsedSec);

  const note = el("span", r.note ? "note" : "note placeholder");
  note.textContent = r.note ?? "メモを追加";
  note.title = "クリックで編集";
  note.addEventListener("click", () => h.editNote(r, note));

  const time = el("small");
  time.textContent = new Date(r.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const del = button("×", "この記録を削除", () => h.deleteRecord(r), "del");

  li.append(a, note, time, del);
  return li;
}

/** note のインライン編集。保存 / 取消後に onDone(saved) を呼ぶ */
export function mountNoteEditor(r: TimestampRecord, host: HTMLSpanElement, onDone: (value: string | null) => void) {
  const input = el("input");
  input.value = r.note ?? "";
  input.placeholder = "メモ";
  host.replaceChildren(input);
  host.classList.remove("placeholder");
  input.focus();

  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    onDone(save ? input.value : null);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ---- helpers ---------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function button(label: string, title: string, onClick: (e: MouseEvent) => void, cls = ""): HTMLButtonElement {
  const b = el("button", cls);
  b.textContent = label;
  b.title = title;
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
