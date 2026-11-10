import { describe, expect, it } from 'vitest';
import { isResizable, resizedUrl, srcSetFor } from './imageUrl';

describe('resizedUrl', () => {
  it('demande une copie réduite des images envoyées depuis le back office', () => {
    expect(resizedUrl('/uploads/1779-abc.jpg', 480)).toBe('/uploads/1779-abc.jpg?w=480');
    expect(resizedUrl('/uploads/avatars/u1-ab12.webp', 100)).toBe('/uploads/avatars/u1-ab12.webp?w=192');
    expect(resizedUrl('/uploads/x.png', 5000)).toBe('/uploads/x.png?w=1600');
  });

  it('laisse tel quel ce qui ne peut pas être réduit', () => {
    expect(resizedUrl('/uploads/anim.gif', 480)).toBe('/uploads/anim.gif');
    expect(resizedUrl('/uploads/film.mp4', 480)).toBe('/uploads/film.mp4');
    expect(resizedUrl('blob:http://localhost/abc', 480)).toBe('blob:http://localhost/abc');
    expect(resizedUrl('https://exemple.com/photo.jpg', 480)).toBe('https://exemple.com/photo.jpg');
    expect(resizedUrl('/uploads/deja.jpg?w=96', 480)).toBe('/uploads/deja.jpg?w=96');
  });

  it('règle la largeur demandée à Unsplash', () => {
    const url = resizedUrl('https://images.unsplash.com/photo-1?auto=format&fit=crop&w=800&q=80', 320);
    expect(new URL(url).searchParams.get('w')).toBe('320');
    expect(new URL(url).searchParams.get('q')).toBe('70');
  });

  it('règle la largeur demandée au CDN des ingrédients', () => {
    expect(resizedUrl('https://emofly.b-cdn.net/k/width:1080/plain/https://s.example/a.png', 192))
      .toBe('https://emofly.b-cdn.net/k/width:192/plain/https://s.example/a.png');
  });
});

describe('srcSetFor', () => {
  it('liste une copie par largeur', () => {
    expect(srcSetFor('/uploads/a.jpg', [320, 640])).toBe('/uploads/a.jpg?w=320 320w, /uploads/a.jpg?w=640 640w');
  });

  it('ne renvoie rien pour une image non réductible', () => {
    expect(srcSetFor('blob:x', [320])).toBeUndefined();
    expect(isResizable('/uploads/a.jpg')).toBe(true);
  });
});
