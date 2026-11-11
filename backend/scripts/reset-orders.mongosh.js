// Remise à zéro des commandes et du journal d'activité (page « Historique » du back-office), en gardant au plus une commande.
//
//   KEEP=LDD-0007            garde cette commande, supprime les autres, la renomme LDD-0001 et repart du compteur 1
//   KEEP=                    (vide) supprime toutes les commandes et remet le compteur à 0
//   APPLY=1                  sans cela, le script ne fait que lister ce qu'il supprimerait
//
//   KEEP=LDD-0007 APPLY=1 mongosh "$MONGO_URI" --quiet --file scripts/reset-orders.mongosh.js
//
// Seuls les commandes, le compteur de numéros et le journal d'activité sont touchés : factures, clients, points de fidélité
// et abonnements restent intacts. Une sauvegarde de la base doit être faite AVANT (le workflow GitHub s'en charge).
const keep = (process.env.KEEP || '').trim();
const apply = process.env.APPLY === '1';
const NUMERO_CONSERVE = 'LDD-0001';

const orders = db.getCollection('orders');
const all = orders.find({}, { numero: 1, statut: 1, createdAt: 1, total: 1, 'client.nom': 1, 'client.prenoms': 1, modeCommande: 1 }).sort({ createdAt: 1 }).toArray();

// Le journal d'un workflow peut être public : les noms des clients sont masqués (deux premières lettres seulement).
const masque = (t) => (t ? `${String(t).slice(0, 2)}…` : '');
print(`${all.length} commande(s) en base :`);
for (const o of all) {
  const nom = `${masque(o.client?.prenoms)} ${masque(o.client?.nom)}`.trim();
  print(`  ${o.numero}  ${o.createdAt.toISOString()}  ${String(o.statut).padEnd(14)} ${String(o.total).padStart(7)} FCFA  ${nom}`);
}

let kept = null;
if (keep) {
  kept = all.find(o => o.numero === keep) || null;
  if (!kept) { print(`ERREUR : la commande ${keep} n'existe pas, rien n'est modifié.`); quit(1); }
}

const toDelete = all.filter(o => !kept || String(o._id) !== String(kept._id));
const historyCount = db.getCollection('historylogs').countDocuments({});
print(kept ? `\nÀ garder : ${kept.numero} (renommée ${NUMERO_CONSERVE}).` : '\nAucune commande à garder.');
print(`À supprimer : ${toDelete.length} commande(s) et ${historyCount} ligne(s) du journal d'activité.`);

if (!apply) { print('Simulation uniquement. Relancez avec APPLY=1 pour appliquer.'); quit(0); }

const del = orders.deleteMany({ _id: { $in: toDelete.map(o => o._id) } });
print(`${del.deletedCount} commande(s) supprimée(s).`);
if (kept) orders.updateOne({ _id: kept._id }, { $set: { numero: NUMERO_CONSERVE } });
db.getCollection('counters').updateOne({ _id: 'order_numero' }, { $set: { seq: kept ? 1 : 0 } }, { upsert: true });
const hist = db.getCollection('historylogs').deleteMany({});
print(`${hist.deletedCount} ligne(s) du journal d'activité supprimée(s).`);
print(`Reste : ${orders.countDocuments({})} commande(s), compteur à ${db.getCollection('counters').findOne({ _id: 'order_numero' }).seq}.`);
