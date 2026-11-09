import { Schema, model, Document, Types } from 'mongoose';

export interface IProgressEntry extends Document {
  userId:    Types.ObjectId;
  date:      Date;
  poids?:    number;
  calories?: number;
  proteines?: number;
  glucides?:  number;
  lipides?:   number;
  eau?:       number;
  notes?:     string;
  createdAt:  Date;
  updatedAt:  Date;
}

const progressEntrySchema = new Schema<IProgressEntry>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date:      { type: Date, required: true },
    poids:     { type: Number, min: 20, max: 300 },
    calories:  { type: Number, min: 0, max: 10000 },
    proteines: { type: Number, min: 0, max: 1000 },
    glucides:  { type: Number, min: 0, max: 2000 },
    lipides:   { type: Number, min: 0, max: 1000 },
    eau:       { type: Number, min: 0, max: 20 },
    notes:     { type: String, maxlength: 500, trim: true },
  },
  { timestamps: true }
);

// Une seule entrée par utilisateur et par jour
progressEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export default model<IProgressEntry>('ProgressEntry', progressEntrySchema);
