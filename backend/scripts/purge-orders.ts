// Supprime des commandes précises, désignées par e-mail client et/ou par numéro. Sans --apply, ne fait que les lister.
//
//   npx tsx scripts/purge-orders.ts --email=test@exemple.ga,autre@exemple.ga
//   npx tsx scripts/purge-orders.ts --numero=LDD-0001,LDD-0002 --apply
//
// Avant de supprimer, le contenu exact des commandes est écrit dans un fichier JSON (chemin affiché).
// Seules les commandes sont supprimées : les factures, mouvements de fidélité et points qui s'y rattachent
// sont comptés et affichés pour que vous décidiez quoi en faire, ils ne sont pas touchés.
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import Invoice from '../models/Invoice.model.js';
import FideliteTransaction from '../models/FideliteTransaction.model.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const listArg = (name: string): string[] =>
  (args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '')
    .split(',').map(v => v.trim()).filter(Boolean);

const emails  = listArg('email').map(e => e.toLowerCase());
const numeros = listArg('numero').map(n => n.toUpperCase());

if (emails.length === 0 && numeros.length === 0) {
  console.error('Indiquez au moins --email=… ou --numero=… (aucune suppression « en bloc » possible).');
  process.exit(1);
}
if (!process.env.MONGO_URI) { console.error('MONGO_URI manquant'); process.exit(1); }

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string);
  try {
    const filter = {
      $or: [
        ...(emails.length  ? [{ 'client.email': { $in: emails } }] : []),
        ...(numeros.length ? [{ numero: { $in: numeros } }] : []),
      ],
    };
    const orders = await Order.find(filter).sort({ createdAt: 1 }).lean();

    console.log(`${orders.length} commande(s) correspondent :`);
    for (const o of orders) {
      const date = o.createdAt.toISOString().slice(0, 10);
      console.log(`  ${o.numero}  ${date}  ${String(o.statut).padEnd(14)} ${String(o.total).padStart(7)} FCFA  ${o.client.email}`);
    }
    if (orders.length === 0) return;

    const ids = orders.map(o => o._id);
    const [invoices, fidelite] = await Promise.all([
      Invoice.countDocuments({ orderId: { $in: ids } }),
      FideliteTransaction.countDocuments({ orderId: { $in: ids } }),
    ]);
    console.log(`Rattachés (non supprimés) : ${invoices} facture(s), ${fidelite} mouvement(s) de fidélité.`);

    if (!apply) {
      console.log('Simulation uniquement. Relancez avec --apply pour supprimer.');
      return;
    }

    const file = path.join(os.tmpdir(), `commandes-supprimees-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(orders, null, 2));
    console.log(`Copie des commandes écrite dans ${file}`);

    const { deletedCount } = await Order.deleteMany({ _id: { $in: ids } });
    console.log(`${deletedCount} commande(s) supprimée(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
