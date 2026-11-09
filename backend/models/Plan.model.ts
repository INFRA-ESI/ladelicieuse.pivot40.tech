import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanFeature {
  texte: string;
  inclus: boolean;
}

export interface IPlan extends Document {
  nom: string;
  description: string;
  /** Prix d'une semaine. */
  prixHebdo: number;
  /** Prix d'un mois (4 semaines) : c'est lui qui porte la réduction. */
  prixMensuel: number;
  tag: string;
  icone: string;
  features: IPlanFeature[];
  populaire: boolean;
  actif: boolean;
  ordre: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    nom:         { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    prixHebdo:   { type: Number, required: true, min: 0 },
    prixMensuel: { type: Number, required: true, min: 0 },
    tag:         { type: String, default: '' },
    icone:       { type: String, default: 'leaf' },
    features:    [{ texte: { type: String, required: true }, inclus: { type: Boolean, default: true } }],
    populaire:   { type: Boolean, default: false },
    actif:       { type: Boolean, default: true },
    ordre:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

PlanSchema.index({ actif: 1 });
PlanSchema.index({ ordre: 1 });

export default mongoose.model<IPlan>('Plan', PlanSchema);
