import mongoose, { Schema, Document, Types } from 'mongoose';

export type PushAudience = 'client' | 'admin';

export interface IPushSubscription extends Document {
  // Client : le compte, déterminé par le serveur d'après la session. Équipe : pas de compte lié (un seul back-office).
  userId?:   Types.ObjectId;
  audience:  PushAudience;
  endpoint:  string;
  keys: {
    p256dh: string;
    auth:   string;
  };
  userAgent?: string;
  // Échecs d'envoi consécutifs (hors abonnement expiré, supprimé tout de suite) : au-delà du seuil, l'abonnement est retiré.
  failures:       number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  createdAt:  Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User' },
    // Les abonnements existants (sans ce champ) sont des abonnements de clients.
    audience:  { type: String, enum: ['client', 'admin'], default: 'client' },
    endpoint:  { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    userAgent: String,
    failures:       { type: Number, default: 0 },
    lastSuccessAt:  Date,
    lastFailureAt:  Date,
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1 });
PushSubscriptionSchema.index({ audience: 1 });

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
