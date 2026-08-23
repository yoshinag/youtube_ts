import { formatElapsed, type TimestampRecord } from "../../src/lib/timestamp";
import { recordsItem } from "../../src/ext/storage";

const list = document.getElementById("list") as HTMLUListElement;
const count = document.getElementById("count") as HTMLSpanElement;
const empty = document.getElementById("empty") as HTMLParagraphElement;
const clear = document.getElementById("clear") as HTMLButtonElement;

function render(records: TimestampRecord[]) {
  list.replaceChildren(
    ...[...records].reverse().map((r) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `https://www.youtube.com/watch?v=${r.videoId}&t=${Math.floor(r.elapsedSec)}s`;
      a.target = "_blank";
      a.textContent = formatElapsed(r.elapsedSec);
      const meta = document.createElement("small");
      meta.textContent = `${r.videoId} · ${new Date(r.capturedAt).toLocaleString()}`;
      li.append(a, meta);
      return li;
    }),
  );
  count.textContent = String(records.length);
  empty.hidden = records.length > 0;
}

clear.addEventListener("click", async () => {
  if (confirm("すべての記録を削除しますか？")) await recordsItem.setValue([]);
});

recordsItem.getValue().then(render);
recordsItem.watch((records) => render(records ?? []));
