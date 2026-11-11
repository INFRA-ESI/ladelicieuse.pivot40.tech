import { describe, it, expect } from 'vitest';
import { buildDocumentHtml, escapeHtml, BRAND } from './printDocument';

const LOGO = 'data:image/webp;base64,AAAA';
const doc = { title: 'Facture', heading: 'Facture F-1', body: '<p>contenu</p>' };

describe('escapeHtml', () => {
  it('neutralise le HTML saisi par un client', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml("l'été & co")).toBe('l&#39;été &amp; co');
  });

  it('accepte les valeurs vides', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('buildDocumentHtml', () => {
  it('affiche le logo, le nom et les coordonnées de la boutique', () => {
    const html = buildDocumentHtml(doc, LOGO);
    expect(html).toContain(`<img src="${LOGO}"`);
    expect(html).toContain(BRAND.name);
    expect(html).toContain(BRAND.email);
  });

  it('impose des coins carrés partout, comme le back-office', () => {
    expect(buildDocumentHtml(doc, LOGO)).toContain('border-radius:0!important');
  });

  it('place le contenu, le filigrane et la pastille de statut', () => {
    const html = buildDocumentHtml({ ...doc, watermark: 'PAYÉE', badge: { text: 'Payée', style: 'color:#065f46' } }, LOGO);
    expect(html).toContain('<p>contenu</p>');
    expect(html).toContain('class="watermark">PAYÉE');
    expect(html).toContain('style="color:#065f46">Payée');
  });
});
