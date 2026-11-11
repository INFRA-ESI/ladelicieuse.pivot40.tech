import mongoose, { Schema, Document } from 'mongoose';

export interface ISuggestion extends Document {
  nom: string;
  description: string;
  type: 'crudites' | 'fruits';
  base?: string;
  ingredients: string[];
  image?: string;
  actif: boolean;
  // Position dans la liste de son type (0 = première). Absente sur les anciennes suggestions : voir services/suggestionOrder.ts.
  ordre?: number;
  // « Meilleure salade » : toujours en première position de son type, quel que soit l'ordre et les ajouts. Une seule par type.
  epinglee: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SuggestionSchema = new Schema<ISuggestion>(
  {
    nom:         { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type:        { type: String, enum: ['crudites', 'fruits'], required: true },
    base:        { type: String, default: '' },
    ingredients: { type: [String], default: [] },
    image:       { type: String, default: '' },
    actif:       { type: Boolean, default: true },
    ordre:       { type: Number, min: 0 },
    epinglee:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

SuggestionSchema.index({ type: 1, actif: 1 });

export default mongoose.model<ISuggestion>('Suggestion', SuggestionSchema);
