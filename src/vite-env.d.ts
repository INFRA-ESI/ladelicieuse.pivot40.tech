/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse qui reçoit les mesures Web Vitals (POST JSON). Absente : aucune mesure n'est envoyée. */
  readonly VITE_VITALS_ENDPOINT?: string;
  /** Part des visites mesurées, entre 0 et 1 (1 par défaut). */
  readonly VITE_VITALS_SAMPLE?: string;
}
