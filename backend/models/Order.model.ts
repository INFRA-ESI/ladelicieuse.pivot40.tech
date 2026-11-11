import mongoose, { Schema, Document, Types } from 'mongoose';
import { nextSequence } from './Counter.model.js';

export type OrderStatus =
  | 'en_attente'
  | 'confirmee'
  | 'en_preparation'
  | 'prete'
  | 'livree'
  | 'annulee'
  | 'remboursee';

export type OrderPriority = 'normale' | 'haute' | 'urgente';
export type ModeCommande  = 'livraison' | 'sur_place' | 'emporter';
export type ModePaiement  = 'mobile_money' | 'carte' | 'especes';

export interface IOrderItem {
  mealId?: Types.ObjectId;
  nom: string;
  qty: number;
  prix: number;
  customizations: string[];
}

export interface IOrderEvent {
  statut: OrderStatus;
  date: Date;
  note?: string;
  par?: string;
}

export interface IOrder extends Document {
  numero: string;
  client: {
    nom: string;
    prenoms?: string;
    email: string;
    telephone: string;
    adresse: string;
  };
  userId?: Types.ObjectId;
  /** Identifiant du panier côté paiement (devis) : relie la commande à sa transaction, et la rend idempotente. */
  refPaiement?: string;
  /**
   * Un paiement en ligne réussi, du montant de la commande, a été retrouvé à l'enregistrement.
   * Absent sur les commandes antérieures à ce contrôle (pas de valeur par défaut, pour éviter de fausses alertes).
   */
  paiementVerifie?: boolean;
  items: IOrderItem[];
  statut: OrderStatus;
  priorite: OrderPriority;
  modeCommande: ModeCommande;
  modePaiement: ModePaiement;
  sousTotal: number;
  fraisLivraison: number;
  /** Réduction d'un code promo (déjà déduite du total) et le code utilisé. */
  remise: number;
  codePromo: string;
  total: number;
  datelivraison?: string;
  creneauLivraison?: string;
  notes: string;
  historique: IOrderEvent[];
  anomalie?: {
    type: 'annulation' | 'remboursement';
    raison: string;
    montant: number;
    date: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    mealId:         { type: Schema.Types.ObjectId, ref: 'Meal' },
    nom:            { type: String, required: true },
    qty:            { type: Number, required: true, min: 1 },
    prix:           { type: Number, required: true, min: 0 },
    customizations: { type: [String], default: [] },
  },
  { _id: false }
);

const OrderEventSchema = new Schema<IOrderEvent>(
  {
    statut: { type: String, required: true },
    date:   { type: Date, default: Date.now },
    note:   String,
    par:    { type: String, default: 'Système' },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    numero:  { type: String, unique: true },
    client: {
      nom:       { type: String, required: true },
      prenoms:   { type: String, default: '' },
      email:     { type: String, default: '', lowercase: true },
      telephone: { type: String, required: true },
      adresse:   { type: String, default: '' },
    },
    userId:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    refPaiement:     { type: String },
    paiementVerifie: { type: Boolean },
    items:         { type: [OrderItemSchema], required: true },
    statut:        { type: String, enum: ['en_attente','confirmee','en_preparation','prete','livree','annulee','remboursee'], default: 'en_attente' },
    priorite:      { type: String, enum: ['normale','haute','urgente'], default: 'normale' },
    modeCommande:  { type: String, enum: ['livraison','sur_place','emporter'], default: 'livraison' },
    modePaiement:  { type: String, enum: ['mobile_money','carte','especes'], default: 'especes' },
    sousTotal:        { type: Number, required: true, min: 0 },
    fraisLivraison:   { type: Number, default: 0, min: 0 },
    remise:           { type: Number, default: 0, min: 0 },
    codePromo:        { type: String, default: '' },
    total:            { type: Number, required: true, min: 0 },
    datelivraison:    { type: String, default: null },
    creneauLivraison: { type: String, default: null },
    notes:            { type: String, default: '' },
    historique:    { type: [OrderEventSchema], default: [] },
    anomalie: {
      type:    { type: String, enum: ['annulation','remboursement'] },
      raison:  String,
      montant: Number,
      date:    Date,
    },
  },
  { timestamps: true }
);

// Génération automatique du numéro de commande avant sauvegarde — compteur atomique, aucune race condition
OrderSchema.pre('save', async function (this: IOrder, next) {
  if (!this.numero) {
    const seq = await nextSequence('order_numero');
    this.numero = `LDD-${String(seq).padStart(4, '0')}`;
  }
  if (this.isNew) {
    this.historique = [{ statut: this.statut, date: new Date(), par: 'Système' }];
  }
  next();
});

OrderSchema.index({ statut: 1 });
OrderSchema.index({ priorite: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'client.email': 1 });
OrderSchema.index({ userId: 1 });
// Un panier ne donne qu'une commande : un renvoi (double clic, réseau instable) ne crée pas de doublon.
OrderSchema.index({ refPaiement: 1 }, { unique: true, sparse: true });

export default mongoose.model<IOrder>('Order', OrderSchema);
