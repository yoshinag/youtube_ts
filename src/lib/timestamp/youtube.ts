/**
 * YouTube ページから配信情報を取り出す純関数群（GDR-DOM-001 §4.4）。
 * DOM アクセスは呼び出し側（content script）が行い、ここには文字列だけを渡す。
 */

/** `var ytInitialPlayerResponse = {...};` を含む script テキストから配信開始時刻（ISO 8601）を抽出する */
export function parseStreamStartAt(scriptText: string): string | null {
  const objectText = extractAssignedObject(scriptText, "ytInitialPlayerResponse");
  if (!objectText) return null;
  try {
    const json = JSON.parse(objectText) as {
      microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { startTimestamp?: unknown } } };
    };
    const ts = json.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp;
    return typeof ts === "string" && Number.isFinite(Date.parse(ts)) ? ts : null;
  } catch {
    return null;
  }
}

/**
 * `name = {...}` の右辺オブジェクトリテラルを、文字列リテラル内の波括弧を無視して切り出す。
 * 終端の `;` や後続文に依存しないので、YouTube 側の script 構成変更に比較的強い。
 */
export function extractAssignedObject(text: string, name: string): string | null {
  const m = new RegExp(`(?:^|[^\\w$])${name}\\s*=\\s*\\{`).exec(text);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** watch URL から videoId を取り出す（`/watch?v=`, `/live/`, `youtu.be/` に対応） */
export function parseVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const fromQuery = u.searchParams.get("v");
  if (fromQuery && isVideoId(fromQuery)) return fromQuery;
  const m = /^\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(u.pathname);
  if (m?.[1]) return m[1];
  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return isVideoId(id) ? id : null;
  }
  return null;
}

function isVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(s);
}

/** 実際のページから情報を集める StreamInfoProvider 実装。content script から使う */
export function createDocumentProvider(doc: Document = document, loc: Location = location) {
  return {
    videoId: () => parseVideoId(loc.href),
    streamStartAt: () => {
      for (const s of Array.from(doc.scripts)) {
        if (!s.textContent?.includes("ytInitialPlayerResponse")) continue;
        const ts = parseStreamStartAt(s.textContent);
        if (ts) return ts;
      }
      return null;
    },
    now: () => Date.now(),
  };
}
