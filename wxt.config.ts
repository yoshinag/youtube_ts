import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  outDir: "dist",
  manifest: {
    name: "YouTube Live Timestamp",
    description: "ライブ配信視聴中のタイムスタンプをショートカットで記録する",
    // storage: 記録（GDR-EXT-001） / downloads: スクショの保存とフォルダ表示（GDR-EXT-002）
    permissions: ["storage", "downloads"],
    commands: {
      "capture-timestamp": {
        suggested_key: { default: "Alt+Shift+T" },
        description: "現在のライブ配信のタイムスタンプを記録",
      },
      "capture-screenshot": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "現在のフレームをスクリーンショットとして保存",
      },
    },
  },
});
