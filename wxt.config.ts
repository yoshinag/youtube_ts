import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  outDir: "dist",
  manifest: {
    name: "YouTube Live Timestamp",
    description: "ライブ配信視聴中のタイムスタンプをショートカットで記録する",
    permissions: ["storage"],
    commands: {
      "capture-timestamp": {
        suggested_key: { default: "Alt+Shift+T" },
        description: "現在のライブ配信のタイムスタンプを記録",
      },
    },
  },
});
