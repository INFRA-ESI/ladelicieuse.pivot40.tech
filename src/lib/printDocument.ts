// Gabarit commun des documents imprimables (facture, rapport de ventes, reçu) : logo de la boutique, coins carrés
// comme le back-office, mêmes couleurs. Chaque document ne fournit que son contenu.

export const BRAND = {
  name: 'La Délicieuse Diète',
  tagline: 'Royaume de la diète · Libreville, Gabon',
  address: 'Quartier Louis, Libreville, Gabon',
  email: 'ladelicieuse.1@gmail.com',
  phone: '+241 76 35 90 20',
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const GREEN = '#267340';
const GREEN_DARK = '#1c4028';
const GREEN_SOFT = '#f4f7f2';
const LINE = '#e4ebe2';

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;border-radius:0!important}
  body{font-family:Arial,Helvetica,sans-serif;color:#333;font-size:12px;background:#fff;line-height:1.5}
  .page-bar{height:4px;background:${GREEN}}
  .doc-head{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:22px 44px;border-bottom:2px solid ${GREEN}}
  .brand{display:flex;align-items:center;gap:16px}
  .brand img{width:76px;height:76px;object-fit:contain;display:block}
  .brand-name{font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:3px;text-transform:uppercase;color:${GREEN_DARK};line-height:1.1}
  .brand-tag{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${GREEN};margin-top:5px}
  .doc-meta{text-align:right}
  .doc-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#7a9488;margin-bottom:4px}
  .doc-title{font-family:Georgia,'Times New Roman',serif;font-size:21px;letter-spacing:2px;color:${GREEN_DARK};text-transform:uppercase}
  .doc-line{font-size:11px;color:#4a6357;margin-top:3px}
  .badge{display:inline-block;padding:4px 12px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:8px}
  .body{padding:30px 44px}
  .section{margin-bottom:28px}
  .section-title{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:${GREEN};font-weight:700;padding-bottom:8px;margin-bottom:12px;border-bottom:1px solid ${LINE}}
  .table-wrap{border:1px solid ${LINE}}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  thead tr{background:${GREEN_DARK}}
  th{padding:10px 12px;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:2px;font-weight:700;text-align:left}
  th.r,td.r{text-align:right}
  td{padding:10px 12px;border-bottom:1px solid #f0f4f0;color:#333}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#f9fbf9}
  .note{background:${GREEN_SOFT};border-left:3px solid ${GREEN};padding:12px 16px;font-size:12px;color:#4a6357}
  .doc-foot{display:flex;justify-content:space-between;align-items:center;gap:20px;background:${GREEN_SOFT};padding:18px 44px;border-top:1px solid ${LINE}}
  .foot-brand{font-family:Georgia,'Times New Roman',serif;font-size:12px;color:${GREEN};letter-spacing:3px;text-transform:uppercase}
  .foot-info{font-size:10px;color:#7a9488;margin-top:2px;line-height:1.6}
  .foot-right{text-align:right;font-size:10px;color:#999;line-height:1.7}
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-family:Georgia,'Times New Roman',serif;font-size:110px;font-weight:700;color:rgba(38,115,64,.06);white-space:nowrap;pointer-events:none;z-index:-1}
  @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
`;

export interface PrintableDocument {
  /** Titre de l'onglet / nom de fichier proposé à l'enregistrement en PDF. */
  title: string;
  /** Petit intitulé au-dessus du titre (ex. « Document »). */
  label?: string;
  /** Titre du document, en grand à droite de l'en-tête. */
  heading: string;
  /** Lignes sous le titre (déjà échappées). */
  lines?: string[];
  /** Pastille de statut à côté des lignes (déjà échappée) et son style. */
  badge?: { text: string; style: string };
  /** Contenu du document (HTML déjà échappé). */
  body: string;
  css?: string;
  watermark?: string;
  footerRight?: string;
  windowFeatures?: string;
}

export function buildDocumentHtml(doc: PrintableDocument, logoDataUri: string): string {
  const lines = (doc.lines ?? []).map(l => `<div class="doc-line">${l}</div>`).join('');
  const badge = doc.badge ? `<div class="badge" style="${doc.badge.style}">${doc.badge.text}</div>` : '';
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>${escapeHtml(doc.title)}</title>
<style>${BASE_CSS}${doc.css ?? ''}</style></head><body>
${doc.watermark ? `<div class="watermark">${escapeHtml(doc.watermark)}</div>` : ''}
<div class="page-bar"></div>
<div class="doc-head">
  <div class="brand">
    <img src="${logoDataUri}" alt="${escapeHtml(BRAND.name)}">
    <div>
      <div class="brand-name">${escapeHtml(BRAND.name)}</div>
      <div class="brand-tag">${escapeHtml(BRAND.tagline)}</div>
    </div>
  </div>
  <div class="doc-meta">
    ${doc.label ? `<div class="doc-label">${escapeHtml(doc.label)}</div>` : ''}
    <div class="doc-title">${doc.heading}</div>
    ${lines}${badge}
  </div>
</div>
<div class="body">${doc.body}</div>
<div class="doc-foot">
  <div>
    <div class="foot-brand">${escapeHtml(BRAND.name)}</div>
    <div class="foot-info">${escapeHtml(BRAND.address)} · ${escapeHtml(BRAND.email)} · ${escapeHtml(BRAND.phone)}</div>
  </div>
  <div class="foot-right">${doc.footerRight ?? ''}</div>
</div>
<div class="page-bar"></div>
</body></html>`;
}

// Ouvre le document dans un nouvel onglet et lance l'impression. La fenêtre est ouverte tout de suite (sinon le navigateur
// bloque le popup), le logo — intégré au document, sans requête réseau — est chargé à la demande.
// Résout à false si le navigateur a bloqué la fenêtre.
export async function printDocument(doc: PrintableDocument): Promise<boolean> {
  const w = window.open('', '_blank', doc.windowFeatures);
  if (!w) return false;
  const { default: logoDataUri } = await import('./logoDataUri');
  w.document.write(buildDocumentHtml(doc, logoDataUri));
  w.document.close();
  w.focus();
  const pending = Array.from(w.document.images)
    .filter(img => !img.complete)
    .map(img => new Promise<void>(resolve => { img.onload = img.onerror = () => resolve(); }));
  await Promise.race([Promise.all(pending), new Promise<void>(resolve => setTimeout(resolve, 3000))]);
  w.print();
  return true;
}
