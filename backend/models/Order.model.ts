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
  items: IOrderItem[];
  statut: OrderStatus;
  priorite: OrderPriority;
  modeCommande: ModeCommande;
  modePaiement: ModePaiement;
  sousTotal: number;
  fraisLivraison: number;
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
      email:     { type: String, required: true, lowercase: true },
      telephone: { type: String, required: true },
      adresse:   { type: String, default: '' },
    },
    userId:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    items:         { type: [OrderItemSchema], required: true },
    statut:        { type: String, enum: ['en_attente','confirmee','en_preparation','prete','livree','annulee','remboursee'], default: 'en_attente' },
    priorite:      { type: String, enum: ['normale','haute','urgente'], default: 'normale' },
    modeCommande:  { type: String, enum: ['livraison','sur_place','emporter'], default: 'livraison' },
    modePaiement:  { type: String, enum: ['mobile_money','carte','especes'], default: 'especes' },
    sousTotal:        { type: Number, required: true, min: 0 },
    fraisLivraison:   { type: Number, default: 0, min: 0 },
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

// Auto-generate order number before save — compteur atomique, aucune race condition
OrderSchema.pre('save', async function (this: IOrder, next) {
  if (!this.numero) {
    const seq = await nextSequence('order_numero');
    this.numero = `CMD-${String(seq).padStart(4, '0')}`;
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

export default mongoose.model<IOrder>('Order', OrderSchema);
