import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerServiceWorker } from "@/lib/pwa";
import "./index.css";

registerServiceWorker();
createRoot(document.getElementById("root")!).render(<App />);

// Mesure des Core Web Vitals : après le chargement complet, en temps libre du navigateur, dans un fichier séparé
// (voir src/lib/webVitals.ts). Les entrées de performance sont mises en tampon par le navigateur : rien n'est perdu.
const demarrerMesure = () => {
  const lancer = () => { void import("@/lib/webVitals").then(m => m.startWebVitals()).catch(() => undefined); };
  if ("requestIdleCallback" in window) window.requestIdleCallback(lancer, { timeout: 5000 });
  else setTimeout(lancer, 3000);
};
if (document.readyState === "complete") demarrerMesure();
else window.addEventListener("load", demarrerMesure, { once: true });
