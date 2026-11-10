// Largeurs que le serveur accepte pour les images envoyées depuis le back office (voir backend/services/imageVariants.ts).
export const UPLOAD_WIDTHS = [96, 192, 320, 480, 640, 960, 1280, 1600] as const;

const UPLOAD_PATH = /^\/uploads\/[^?#]+\.(?:jpe?g|png|webp)$/i;
const BUNNY_WIDTH = /\/width:\d+\//;

const snapUp = (width: number): number => UPLOAD_WIDTHS.find(w => w >= width) ?? UPLOAD_WIDTHS[UPLOAD_WIDTHS.length - 1];

/** Adresse de la même image à la largeur demandée, ou l'adresse d'origine quand on ne sait pas la réduire. */
export function resizedUrl(src: string, width: number): string {
  if (UPLOAD_PATH.test(src)) return `${src}?w=${snapUp(width)}`;
  if (src.startsWith('https://images.unsplash.com/')) {
    const url = new URL(src);
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', '70');
    return url.toString();
  }
  if (src.startsWith('https://emofly.b-cdn.net/') && BUNNY_WIDTH.test(src)) return src.replace(BUNNY_WIDTH, `/width:${width}/`);
  return src;
}

export const isResizable = (src: string): boolean => resizedUrl(src, 480) !== src;

/** Valeur de `srcset` pour les largeurs voulues, ou undefined quand l'image ne peut pas être réduite. */
export function srcSetFor(src: string, widths: readonly number[]): string | undefined {
  if (!isResizable(src)) return undefined;
  return widths.map(w => `${resizedUrl(src, w)} ${w}w`).join(', ');
}
