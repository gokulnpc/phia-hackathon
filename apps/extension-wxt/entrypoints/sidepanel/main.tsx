import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { App } from "../../src/sidepanel/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
