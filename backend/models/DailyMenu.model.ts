import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDailyMenu extends Document {
  date: string; // YYYY-MM-DD
  repas: Types.ObjectId[];
  published: boolean;
  // Date du menu dont celui-ci est une copie (information seulement : aucune liaison, chaque date vit sa vie).
  copiedFrom?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyMenuSchema = new Schema<IDailyMenu>(
  {
    date:      { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    repas:     [{ type: Schema.Types.ObjectId, ref: 'Meal' }],
    published: { type: Boolean, default: false },
    copiedFrom: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true }
);

DailyMenuSchema.index({ date: -1 });
DailyMenuSchema.index({ published: 1 });

export default mongoose.model<IDailyMenu>('DailyMenu', DailyMenuSchema);
