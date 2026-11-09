import mongoose, { Schema, Document } from 'mongoose';

export interface ITestimonial extends Document {
  nom: string;
  texte: string;
  note: number;
  page: 'consultations' | 'abonnement' | 'accueil';
  actif: boolean;
  source: 'admin' | 'client';
  statut: 'en_attente' | 'approuve' | 'refuse';
  email?: string;
}

const TestimonialSchema = new Schema<ITestimonial>(
  {
    nom:    { type: String, required: true, trim: true },
    texte:  { type: String, required: true, trim: true },
    note:   { type: Number, default: 5, min: 1, max: 5 },
    page:   { type: String, enum: ['consultations', 'abonnement', 'accueil'], required: true },
    actif:  { type: Boolean, default: true },
    source: { type: String, enum: ['admin', 'client'], default: 'admin' },
    statut: { type: String, enum: ['en_attente', 'approuve', 'refuse'], default: 'approuve' },
    email:  { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

TestimonialSchema.index({ page: 1, actif: 1 });
TestimonialSchema.index({ statut: 1, source: 1 });

export default mongoose.model<ITestimonial>('Testimonial', TestimonialSchema);
