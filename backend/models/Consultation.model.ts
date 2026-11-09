import mongoose, { Schema, Document } from 'mongoose';

export interface IConsultation extends Document {
  titre: string;
  description: string;
  /** Tarif de la téléconsultation. */
  prix: number;
  /** Tarif en présentiel. */
  prixPresentiel: number;
  duree: string;
  tag: string;
  image: string;
  actif: boolean;
  ordre: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConsultationSchema = new Schema<IConsultation>(
  {
    titre:       { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    prix:        { type: Number, required: true, min: 0 },
    prixPresentiel: { type: Number, required: true, min: 0, default: 25000 },
    duree:       { type: String, required: true, default: '60 min' },
    tag:         { type: String, default: '' },
    image:       { type: String, default: '' },
    actif:       { type: Boolean, default: true },
    ordre:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

ConsultationSchema.index({ actif: 1 });
ConsultationSchema.index({ ordre: 1 });

export default mongoose.model<IConsultation>('Consultation', ConsultationSchema);
