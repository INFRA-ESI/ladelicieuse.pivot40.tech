import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerServiceWorker } from "@/lib/pwa";
import "./index.css";

registerServiceWorker();
createRoot(document.getElementById("root")!).render(<App />);
