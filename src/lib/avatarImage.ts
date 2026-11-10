// La photo s'affiche à 80 px au plus (160 px sur écran dense) et à 480 px dans la visionneuse.
const SIZE = 384;

// Recadre la photo en carré centré et la réduit avant l'envoi : une photo de téléphone de 6 Mo devient ~25 Ko,
// et le serveur n'a jamais à traiter une image de 12 mégapixels.
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choisissez une image JPEG, PNG ou WebP.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Cette image n'a pas pu être lue."); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(SIZE, side);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Cette image n'a pas pu être traitée.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
  if (!blob) throw new Error("Cette image n'a pas pu être traitée.");
  return blob;
}
