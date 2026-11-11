// Enregistre un fichier dans le dossier de téléchargements de l'appareil (comme n'importe quel fichier téléchargé), sans
// ouvrir de fenêtre : utilisé pour les PDF et les CSV.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Libérer l'adresse trop tôt annule le téléchargement sur certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// « Rapport de ventes — Octobre 2026 » → « rapport-de-ventes-octobre-2026 » : nom de fichier sans accents ni caractères interdits.
export function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'document';
}
