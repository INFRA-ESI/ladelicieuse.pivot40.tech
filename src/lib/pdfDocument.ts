import type { jsPDF as JsPdf } from 'jspdf';
import { downloadBlob } from './downloadFile';

// Génère un vrai fichier PDF (texte sélectionnable, pagination propre) et l'enregistre dans le dossier de téléchargements.
// Logo de la boutique, coins carrés comme le back-office, mêmes couleurs pour la facture, le rapport de ventes et le reçu.
// jsPDF n'est chargé qu'au moment du téléchargement : il n'alourdit aucune page.

export const BRAND = {
  name: 'La Délicieuse Diète',
  tagline: 'Royaume de la diète · Libreville, Gabon',
  address: 'Quartier Louis, Libreville, Gabon',
  email: 'ladelicieuse.1@gmail.com',
  phone: '+241 76 35 90 20',
};

type Rgb = [number, number, number];
const GREEN: Rgb = [38, 115, 64];
const GREEN_DARK: Rgb = [28, 64, 40];
const GREEN_SOFT: Rgb = [244, 247, 242];
const LINE: Rgb = [228, 235, 226];
const TEXT: Rgb = [51, 51, 51];
const MUTED: Rgb = [122, 148, 136];
const TONES: Record<'good' | 'warn' | 'bad', Rgb> = { good: [22, 163, 74], warn: [217, 119, 6], bad: [220, 38, 38] };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_H = 18;

export type Tone = keyof typeof TONES;

export type PdfBlock =
  | { kind: 'section'; title: string }
  | { kind: 'columns'; columns: { title: string; strong?: string; lines: string[] }[] }
  | { kind: 'info'; items: { label: string; value: string }[] }
  | { kind: 'kpis'; items: { label: string; value: string; unit?: string; strong?: boolean; tone?: Tone }[] }
  | { kind: 'gauge'; label: string; value: number; caption: string; tone: Tone }
  | { kind: 'table'; head: string[]; rows: string[][]; align?: ('left' | 'right')[]; widths?: (number | undefined)[]; toneColumn?: number }
  | { kind: 'totals'; rows: [string, string][]; total: [string, string] }
  | { kind: 'note'; text: string; aside?: string }
  | { kind: 'thanks'; text: string };

export interface PdfDocument {
  /** Nom du fichier enregistré, sans l'extension. */
  fileName: string;
  heading: string;
  /** Petit intitulé au-dessus du titre. */
  label?: string;
  lines?: string[];
  badge?: { text: string; fill: Rgb; color: Rgb };
  watermark?: string;
  blocks: PdfBlock[];
  footerRight?: string[];
}

// Les polices standard d'un PDF ne couvrent pas tout Unicode : l'espace fine des milliers (« 10 030 ») et les emojis
// s'afficheraient en caractères parasites. On les remplace ou on les retire.
export const pdfText = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/[^\n -~¡-ÿ–—‘’“”…€Œœ]/g, '');

export const toneFor = (pct: number): Tone => (pct >= 55 ? 'good' : pct >= 40 ? 'warn' : 'bad');

export async function downloadPdf(spec: PdfDocument): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { default: logo }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./logoDataUri'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: pdfText(spec.heading), author: BRAND.name });

  let y = drawHeader(doc, spec, logo);

  const ensure = (height: number) => {
    if (y + height > PAGE_H - FOOTER_H - 6) { doc.addPage(); y = 18; }
  };

  for (const block of spec.blocks) {
    switch (block.kind) {
      case 'section': {
        ensure(16);
        doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...GREEN);
        doc.text(pdfText(block.title).toUpperCase(), MARGIN, y, { charSpace: 0.5 });
        doc.setDrawColor(...LINE).setLineWidth(0.25).line(MARGIN, y + 2.2, PAGE_W - MARGIN, y + 2.2);
        y += 8;
        break;
      }
      case 'columns': {
        const gap = 8;
        const w = (CONTENT_W - gap * (block.columns.length - 1)) / block.columns.length;
        const heights = block.columns.map(c => 11 + (c.strong ? 6 : 0) + c.lines.length * 4.2);
        ensure(Math.max(...heights) + 6);
        block.columns.forEach((c, i) => {
          const x = MARGIN + i * (w + gap);
          let cy = y;
          doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...GREEN);
          doc.text(pdfText(c.title).toUpperCase(), x, cy, { charSpace: 0.5 });
          doc.setDrawColor(...LINE).setLineWidth(0.25).line(x, cy + 2, x + w, cy + 2);
          cy += 8;
          if (c.strong) {
            doc.setFont('times', 'normal').setFontSize(11).setTextColor(...GREEN_DARK);
            doc.text(pdfText(c.strong), x, cy, { maxWidth: w });
            cy += 6;
          }
          doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(74, 99, 87);
          c.lines.forEach(line => { doc.text(pdfText(line), x, cy, { maxWidth: w }); cy += 4.2; });
        });
        y += Math.max(...heights) + 6;
        break;
      }
      case 'info': {
        const rowH = 11;
        const rows = Math.ceil(block.items.length / 2);
        ensure(rows * rowH + 4);
        block.items.forEach((item, i) => {
          const x = MARGIN + (i % 2) * (CONTENT_W / 2);
          const iy = y + Math.floor(i / 2) * rowH;
          doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
          doc.text(pdfText(item.label).toUpperCase(), x, iy, { charSpace: 0.4 });
          doc.setFontSize(9.5).setTextColor(...TEXT);
          doc.text(pdfText(item.value), x, iy + 5, { maxWidth: CONTENT_W / 2 - 4 });
        });
        y += rows * rowH + 4;
        break;
      }
      case 'kpis': {
        const cols = 3;
        const gap = 3;
        const w = (CONTENT_W - gap * (cols - 1)) / cols;
        const h = 18;
        const rows = Math.ceil(block.items.length / cols);
        ensure(rows * (h + gap) + 4);
        block.items.forEach((item, i) => {
          const x = MARGIN + (i % cols) * (w + gap);
          const ky = y + Math.floor(i / cols) * (h + gap);
          doc.setFillColor(...(item.strong ? GREEN_SOFT : [249, 250, 249] as Rgb)).setDrawColor(...(item.strong ? [208, 220, 203] as Rgb : LINE)).setLineWidth(0.2);
          doc.rect(x, ky, w, h, 'FD');
          doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...MUTED);
          doc.text(pdfText(item.label).toUpperCase(), x + 4, ky + 6, { charSpace: 0.4 });
          const color: Rgb = item.tone ? TONES[item.tone] : item.strong ? GREEN : GREEN_DARK;
          doc.setFont('times', 'normal').setFontSize(14).setTextColor(...color);
          const value = pdfText(item.value);
          doc.text(value, x + 4, ky + 13.5);
          if (item.unit) {
            const vw = doc.getTextWidth(value);
            doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
            doc.text(pdfText(item.unit), x + 4 + vw + 1.5, ky + 13.5);
          }
        });
        y += rows * (h + gap) + 2;
        break;
      }
      case 'gauge': {
        const h = 22;
        ensure(h + 6);
        doc.setFillColor(...GREEN_SOFT).rect(MARGIN, y, CONTENT_W, h, 'F');
        doc.setFillColor(...GREEN).rect(MARGIN, y, 1, h, 'F');
        doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(100, 100, 100);
        doc.text(pdfText(block.label).toUpperCase(), MARGIN + 6, y + 6.5, { charSpace: 0.4 });
        doc.setFont('times', 'normal').setFontSize(22).setTextColor(...TONES[block.tone]);
        doc.text(pdfText(`${block.value}%`), MARGIN + 6, y + 17);
        const bx = MARGIN + 50;
        const bw = CONTENT_W - 56;
        doc.setFillColor(208, 220, 203).rect(bx, y + 9, bw, 2.2, 'F');
        doc.setFillColor(...TONES[block.tone]).rect(bx, y + 9, bw * Math.max(0, Math.min(100, block.value)) / 100, 2.2, 'F');
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(74, 99, 87);
        doc.text(pdfText(block.caption), bx, y + 16);
        y += h + 8;
        break;
      }
      case 'table': {
        const align = block.align ?? [];
        const columnStyles: Record<number, { halign: 'left' | 'right'; cellWidth?: number }> = {};
        block.head.forEach((_, i) => {
          columnStyles[i] = { halign: align[i] ?? 'left', ...(block.widths?.[i] ? { cellWidth: block.widths[i] } : {}) };
        });
        ensure(24);
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN, top: 18, bottom: FOOTER_H + 6 },
          head: [block.head.map(pdfText)],
          body: block.rows.map(r => r.map(pdfText)),
          theme: 'plain',
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 }, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } as unknown as number, overflow: 'linebreak' },
          headStyles: { fillColor: GREEN_DARK, textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', lineWidth: 0 },
          alternateRowStyles: { fillColor: [249, 251, 249] },
          columnStyles,
          didParseCell: data => {
            if (data.section === 'head') data.cell.styles.halign = align[data.column.index] ?? 'left';
            if (data.section === 'body' && block.toneColumn === data.column.index) {
              const pct = parseFloat(String(data.cell.raw).replace(',', '.'));
              if (!Number.isNaN(pct)) { data.cell.styles.textColor = TONES[toneFor(pct)]; data.cell.styles.fontStyle = 'bold'; }
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        break;
      }
      case 'totals': {
        const w = 82;
        const x = PAGE_W - MARGIN - w;
        ensure(block.rows.length * 8 + 22);
        block.rows.forEach(([label, value]) => {
          doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(74, 99, 87);
          doc.text(pdfText(label), x, y + 5);
          doc.text(pdfText(value), x + w, y + 5, { align: 'right' });
          doc.setDrawColor(...LINE).setLineWidth(0.2).line(x, y + 7.5, x + w, y + 7.5);
          y += 8;
        });
        y += 2;
        doc.setFillColor(...GREEN_DARK).rect(x, y, w, 13, 'F');
        doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(255, 255, 255);
        doc.text(pdfText(block.total[0]).toUpperCase(), x + 5, y + 8, { charSpace: 0.5 });
        doc.setFont('times', 'normal').setFontSize(13);
        doc.text(pdfText(block.total[1]), x + w - 5, y + 8.6, { align: 'right' });
        y += 21;
        break;
      }
      case 'note': {
        ensure(16);
        doc.setFillColor(...GREEN_SOFT).rect(MARGIN, y, CONTENT_W, 11, 'F');
        doc.setFillColor(...GREEN).rect(MARGIN, y, 0.9, 11, 'F');
        doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(74, 99, 87);
        doc.text(pdfText(block.text), MARGIN + 5, y + 6.8, { maxWidth: CONTENT_W - 10 });
        if (block.aside) doc.setFont('helvetica', 'italic').text(pdfText(block.aside), PAGE_W - MARGIN - 4, y + 6.8, { align: 'right' });
        y += 18;
        break;
      }
      case 'thanks': {
        ensure(12);
        doc.setFont('times', 'italic').setFontSize(11).setTextColor(74, 99, 87);
        doc.text(pdfText(block.text), PAGE_W / 2, y + 4, { align: 'center' });
        y += 10;
        break;
      }
    }
  }

  drawFooters(doc, spec);
  downloadBlob(doc.output('blob'), `${spec.fileName}.pdf`);
}

function drawHeader(doc: JsPdf, spec: PdfDocument, logo: string): number {
  doc.setFillColor(...GREEN).rect(0, 0, PAGE_W, 1.4, 'F');
  doc.addImage(logo, 'WEBP', MARGIN, 7, 24, 24);
  doc.setFont('times', 'normal').setFontSize(15).setTextColor(...GREEN_DARK);
  doc.text(pdfText(BRAND.name).toUpperCase(), MARGIN + 29, 17, { charSpace: 0.9 });
  doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...GREEN);
  doc.text(pdfText(BRAND.tagline).toUpperCase(), MARGIN + 29, 22.5, { charSpace: 0.5 });

  const right = PAGE_W - MARGIN;
  let ry = 12;
  if (spec.label) {
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED);
    doc.text(pdfText(spec.label).toUpperCase(), right, ry, { align: 'right', charSpace: 0.5 });
    ry += 5.5;
  }
  doc.setFont('times', 'normal').setFontSize(15).setTextColor(...GREEN_DARK);
  doc.text(pdfText(spec.heading).toUpperCase(), right, ry, { align: 'right', charSpace: 0.5 });
  ry += 5;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(74, 99, 87);
  (spec.lines ?? []).forEach(line => { doc.text(pdfText(line), right, ry, { align: 'right' }); ry += 4.2; });
  if (spec.badge) {
    doc.setFont('helvetica', 'bold').setFontSize(7);
    const text = pdfText(spec.badge.text).toUpperCase();
    const bw = doc.getTextWidth(text) + 8;
    doc.setFillColor(...spec.badge.fill).rect(right - bw, ry - 1, bw, 6, 'F');
    doc.setTextColor(...spec.badge.color).text(text, right - bw / 2, ry + 3, { align: 'center', charSpace: 0.4 });
  }
  doc.setDrawColor(...GREEN).setLineWidth(0.5).line(MARGIN, 36, PAGE_W - MARGIN, 36);
  return 46;
}

function drawFooters(doc: JsPdf, spec: PdfDocument): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (spec.watermark) {
      doc.saveGraphicsState();
      const GState = doc.GState as unknown as new (params: { opacity: number }) => Parameters<JsPdf['setGState']>[0];
      doc.setGState(new GState({ opacity: 0.07 }));
      doc.setFont('times', 'bold').setFontSize(80).setTextColor(...GREEN);
      doc.text(pdfText(spec.watermark), PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    }
    const top = PAGE_H - FOOTER_H;
    doc.setFillColor(...GREEN_SOFT).rect(0, top, PAGE_W, FOOTER_H - 1.4, 'F');
    doc.setFillColor(...GREEN).rect(0, PAGE_H - 1.4, PAGE_W, 1.4, 'F');
    doc.setFont('times', 'normal').setFontSize(8.5).setTextColor(...GREEN);
    doc.text(pdfText(BRAND.name).toUpperCase(), MARGIN, top + 7, { charSpace: 0.8 });
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED);
    doc.text(pdfText(`${BRAND.address} · ${BRAND.email} · ${BRAND.phone}`), MARGIN, top + 11.5);
    const right = [...(spec.footerRight ?? []), `Page ${p} / ${pages}`];
    doc.setFontSize(6.8).setTextColor(150, 150, 150);
    right.forEach((line, i) => doc.text(pdfText(line), PAGE_W - MARGIN, top + 6 + i * 3.6, { align: 'right' }));
  }
}
