interface PosterOptions {
  /** Seconde de la vidéo à prendre (ramenée à la moitié de la durée pour les vidéos très courtes). */
  at?: number;
  maxWidth?: number;
}

// Extrait une image de la vidéo dans le navigateur de l'administrateur. La page d'accueil affiche cette image au lieu de
// télécharger la vidéo pour fabriquer sa vignette : affichage immédiat, et rien de lourd tant que personne ne lance la lecture.
// La source doit être un fichier local ou une adresse du même site (sinon le navigateur interdit de lire l'image).
export function capturePoster(source: Blob | string, { at = 1, maxWidth = 960 }: PosterOptions = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const local = typeof source !== 'string';
    const url = local ? URL.createObjectURL(source) : source;
    let finished = false;

    const finish = (outcome: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      if (local) URL.revokeObjectURL(url);
      outcome();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('La miniature a pris trop de temps à se générer.'))), 20_000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => finish(() => reject(new Error("Ce format de vidéo ne permet pas de générer la miniature.")));
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 2;
      video.currentTime = Math.min(at, duration / 2);
    };
    video.onseeked = () => {
      if (!video.videoWidth) { finish(() => reject(new Error('Image de la vidéo introuvable.'))); return; }
      const width = Math.min(maxWidth, video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((width * video.videoHeight) / video.videoWidth);
      const ctx = canvas.getContext('2d');
      if (!ctx) { finish(() => reject(new Error('Miniature impossible dans ce navigateur.'))); return; }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        finish(() => reject(new Error('Miniature impossible : la vidéo doit venir du même site.')));
        return;
      }
      canvas.toBlob(blob => finish(() => (blob ? resolve(blob) : reject(new Error('Miniature impossible dans ce navigateur.')))), 'image/webp', 0.78);
    };
    video.src = url;
  });
}
