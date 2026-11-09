import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  userId?: Types.ObjectId;
  clientNom: string;
  clientEmail: string;
  clientTelephone: string;
  planId: string;
  planName: string;
  billing: 'weekly' | 'monthly' | 'annual'; // 'annual' : abonnements historiques
  price: number;
  /** 'en_attente' : demande enregistrée, paiement pas encore constaté (espèces sur place, ou paiement en ligne non retrouvé). */
  statut: 'active' | 'paused' | 'cancelled' | 'en_attente';
  /** Identifiant du panier côté paiement (devis) : relie l'abonnement à sa transaction et le rend idempotent. */
  refPaiement?: string;
  /** Un paiement en ligne réussi, du montant du plan, a été retrouvé à l'enregistrement. */
  paiementVerifie?: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    clientNom:       { type: String, required: true },
    clientEmail:     { type: String, required: true, lowercase: true },
    clientTelephone: { type: String, required: true },
    planId:          { type: String, required: true },
    planName:        { type: String, required: true },
    billing:         { type: String, enum: ['weekly','monthly','annual'], required: true },
    price:           { type: Number, required: true, min: 0 },
    statut:          { type: String, enum: ['active','paused','cancelled','en_attente'], default: 'active' },
    refPaiement:     { type: String },
    paiementVerifie: { type: Boolean },
    startDate:       { type: Date, default: Date.now },
    endDate:         { type: Date, required: true },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ clientEmail: 1 });
SubscriptionSchema.index({ statut: 1 });
SubscriptionSchema.index({ planId: 1 });
// Un paiement ne donne qu'un abonnement : un renvoi (double clic, réseau instable) n'en crée pas un second.
SubscriptionSchema.index({ refPaiement: 1 }, { unique: true, sparse: true });

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
