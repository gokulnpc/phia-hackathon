import { initMirrorContentScript } from "../src/content/bootstrap";

export default defineContentScript({
  matches: ["https://*/*", "http://localhost:*/*"],
  runAt: "document_idle",
  main() {
    initMirrorContentScript();
  },
});
