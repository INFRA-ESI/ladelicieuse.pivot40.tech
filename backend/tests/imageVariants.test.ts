import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import sharp from 'sharp';

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { variantMiddleware, shrinkUpload, purgeVariants } = await import('../services/imageVariants.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'variants-'));
fs.mkdirSync(path.join(root, 'avatars'));
const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 90, b: 40 } } }).jpeg().toBuffer();

fs.writeFileSync(path.join(root, 'plat.jpg'), await photo(2400, 1600));
fs.writeFileSync(path.join(root, 'avatars', 'moi.jpg'), await photo(600, 600));
fs.writeFileSync(path.join(root, 'faux.jpg'), 'ceci n\'est pas une image');
fs.writeFileSync(path.join(path.dirname(root), 'secret.jpg'), await photo(10, 10));

const app = express();
app.use('/uploads', variantMiddleware(root));
app.use('/uploads', express.static(root));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/uploads`;

afterAll(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(path.join(path.dirname(root), 'secret.jpg'), { force: true });
});

describe('copies redimensionnées des images', () => {
  it('sert une copie WebP à la largeur demandée, gardée un an', async () => {
    const res = await fetch(`${base}/plat.jpg?w=480`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(480);
  });

  it('fonctionne aussi dans un sous-dossier (photos de profil)', async () => {
    const res = await fetch(`${base}/avatars/moi.jpg?w=96`);
    expect(res.status).toBe(200);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(96);
  });

  it('n\'agrandit jamais une petite image', async () => {
    const res = await fetch(`${base}/avatars/moi.jpg?w=960`);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(600);
  });

  it('ignore une largeur hors liste et renvoie l\'original', async () => {
    const res = await fetch(`${base}/plat.jpg?w=7`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(2400);
  });

  it('ne sort pas du dossier des envois', async () => {
    const res = await fetch(`${base}/%2e%2e/secret.jpg?w=96`);
    expect(res.headers.get('content-type')).not.toBe('image/webp');
  });

  it('laisse le fichier statique répondre 404 quand l\'image n\'existe pas', async () => {
    expect((await fetch(`${base}/absente.jpg?w=96`)).status).toBe(404);
  });

  it('retombe sur l\'original quand le fichier n\'est pas une image lisible', async () => {
    const res = await fetch(`${base}/faux.jpg?w=96`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('pas une image');
  });

  it('supprime les copies d\'une image supprimée', async () => {
    await fetch(`${base}/plat.jpg?w=320`);
    const cache = path.join(root, '.cache');
    const before = fs.readdirSync(cache).length;
    await purgeVariants(root, '/uploads/plat.jpg');
    expect(fs.readdirSync(cache).length).toBeLessThan(before);
    expect(fs.readdirSync(cache).filter(n => n.endsWith('.webp')).length).toBe(2); // les deux copies de l'avatar restent
  });
});

describe('réduction à l\'envoi', () => {
  it('convertit une grande photo en WebP de 1600 px maximum et supprime l\'original', async () => {
    const file = path.join(root, 'gros.jpg');
    fs.writeFileSync(file, await photo(4000, 3000));
    const kept = await shrinkUpload(file);
    expect(kept).toBe(path.join(root, 'gros.webp'));
    expect(fs.existsSync(file)).toBe(false);
    const meta = await sharp(kept).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
  });

  it('garde le fichier tel quel quand il est illisible', async () => {
    const file = path.join(root, 'casse.png');
    fs.writeFileSync(file, 'pas une image');
    expect(await shrinkUpload(file)).toBe(file);
    expect(fs.existsSync(file)).toBe(true);
  });
});
