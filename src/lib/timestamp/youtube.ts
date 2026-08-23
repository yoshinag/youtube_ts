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

export interface VideoDetails {
  videoId: string;
  title: string;
  author: string | null;
}

/** `ytInitialPlayerResponse.videoDetails` からタイトル等を取り出す */
export function parseVideoDetails(scriptText: string): VideoDetails | null {
  const objectText = extractAssignedObject(scriptText, "ytInitialPlayerResponse");
  if (!objectText) return null;
  try {
    const json = JSON.parse(objectText) as { videoDetails?: { videoId?: unknown; title?: unknown; author?: unknown } };
    const d = json.videoDetails;
    if (!d || typeof d.videoId !== "string" || typeof d.title !== "string" || !d.title) return null;
    return { videoId: d.videoId, title: d.title, author: typeof d.author === "string" && d.author ? d.author : null };
  } catch {
    return null;
  }
}

/** `document.title` から末尾の " - YouTube" を除いたタイトル。空なら null */
export function titleFromDocument(docTitle: string): string | null {
  const t = docTitle.replace(/\s*-\s*YouTube\s*$/u, "").trim();
  return t || null;
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
  const playerScript = () =>
    Array.from(doc.scripts)
      .map((s) => s.textContent ?? "")
      .find((t) => t.includes("ytInitialPlayerResponse")) ?? null;
  const videoId = () => parseVideoId(loc.href);
  /** videoDetails は URL の videoId と一致するときだけ信頼する（SPA 遷移後の古い値を避ける） */
  const trustedDetails = () => {
    const script = playerScript();
    const d = script ? parseVideoDetails(script) : null;
    return d && d.videoId === videoId() ? d : null;
  };
  return {
    videoId,
    streamStartAt: () => {
      const script = playerScript();
      return script ? parseStreamStartAt(script) : null;
    },
    title: () => trustedDetails()?.title ?? titleFromDocument(doc.title),
    channel: () => trustedDetails()?.author ?? null,
    now: () => Date.now(),
  };
}

export type DocumentProvider = ReturnType<typeof createDocumentProvider>;
