// Type réel d'une image d'après ses premiers octets : le Content-Type envoyé par le navigateur se falsifie, pas la signature du fichier.
export type ImageType = 'jpeg' | 'png' | 'webp';

export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export const IMAGE_EXTENSION: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
