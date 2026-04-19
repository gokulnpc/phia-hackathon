import { defineConfig } from "wxt";

export default defineConfig({
  // Use a non-dot folder so macOS Finder / Chrome "Load unpacked" show the build without toggling hidden files (Cmd+Shift+.).
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Mirror",
    description: "Virtual try-on for shopping",
    version: "0.0.1",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    host_permissions: ["https://*/*", "http://localhost:*/*"],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
    },
    web_accessible_resources: [
      {
        resources: ["overlay.html", "*.js", "*.css"],
        matches: ["https://*/*", "http://localhost:*/*"],
      },
    ],
    action: {
      default_title: "Mirror",
    },
  },
});
