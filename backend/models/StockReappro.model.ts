import mongoose, { Schema, Document, Types } from 'mongoose';

export type ReapproStatus = 'brouillon' | 'envoyee' | 'confirmee' | 'recue' | 'annulee';

export interface IReapproArticle {
  ingredientId: Types.ObjectId;
  nom: string;
  quantiteCommandee: number;
  quantiteRecue: number;
  prixUnitaire: number;
}

export interface IStockReappro extends Document {
  fournisseurId: Types.ObjectId;
  fournisseur: string;
  articles: IReapproArticle[];
  statut: ReapproStatus;
  total: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReapproArticleSchema = new Schema<IReapproArticle>(
  {
    ingredientId:     { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    nom:              { type: String, required: true },
    quantiteCommandee:{ type: Number, required: true, min: 1 },
    quantiteRecue:    { type: Number, default: 0, min: 0 },
    prixUnitaire:     { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const StockReapproSchema = new Schema<IStockReappro>(
  {
    fournisseurId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    fournisseur:   { type: String, required: true },
    articles:      { type: [ReapproArticleSchema], required: true },
    statut:        { type: String, enum: ['brouillon','envoyee','confirmee','recue','annulee'], default: 'brouillon' },
    total:         { type: Number, default: 0, min: 0 },
    notes:         { type: String, default: '' },
  },
  { timestamps: true }
);

// Calcul automatique du total avant sauvegarde
StockReapproSchema.pre('save', function (this: IStockReappro, next) {
  this.total = this.articles.reduce(
    (sum, a) => sum + a.quantiteCommandee * a.prixUnitaire,
    0
  );
  next();
});

StockReapproSchema.index({ statut: 1 });
StockReapproSchema.index({ createdAt: -1 });
StockReapproSchema.index({ fournisseurId: 1 });

export default mongoose.model<IStockReappro>('StockReappro', StockReapproSchema);
