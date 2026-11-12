import mongoose, { Schema, Document, Types } from 'mongoose';

export type StockLevel = 'rupture' | 'critique' | 'faible' | 'normal';

export interface IIngredient extends Document {
  nom: string;
  categorie: string;
  unite: 'portion' | 'pièce' | 'litre' | 'kg' | 'g';
  stock: number;
  stockMin: number;
  stockOptimal: number;
  prixAchat: number;
  prixVente: number;
  image: string;
  nutrition: {
    calories: number;
    proteines: number;
    glucides: number;
    lipides: number;
    fibres: number;
  };
  fournisseurId?: Types.ObjectId;
  actif: boolean;
  /** Position dans sa catégorie (0 = premier). Absente sur les anciens ingrédients : voir services/displayOrder.ts. */
  ordre?: number;
  /** « Le meilleur » de sa catégorie : toujours en première position. Un seul par catégorie. */
  epinglee: boolean;
  /** Où l'ingrédient est proposé : composeur de salades, repas chauds, ou les deux. */
  usage: 'salade' | 'repas' | 'tous';
  /** Poids (g) d'une portion vendue ; `nutrition` est exprimée pour 100 g. */
  portionGrammes: number;
  createdAt: Date;
  updatedAt: Date;
  stockLevel: StockLevel;
}

const IngredientSchema = new Schema<IIngredient>(
  {
    nom:          { type: String, required: true, trim: true },
    categorie:    { type: String, required: true },
    image:        { type: String, default: '' },
    unite:        { type: String, enum: ['portion', 'pièce', 'litre', 'kg', 'g'], default: 'portion' },
    stock:        { type: Number, required: true, min: 0, default: 0 },
    stockMin:     { type: Number, required: true, min: 0, default: 5 },
    stockOptimal: { type: Number, required: true, min: 0, default: 20 },
    prixAchat:    { type: Number, required: true, min: 0 },
    prixVente:    { type: Number, required: true, min: 0 },
    nutrition: {
      calories:  { type: Number, default: 0 },
      proteines: { type: Number, default: 0 },
      glucides:  { type: Number, default: 0 },
      lipides:   { type: Number, default: 0 },
      fibres:    { type: Number, default: 0 },
    },
    fournisseurId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    actif:         { type: Boolean, default: true },
    ordre:         { type: Number, min: 0 },
    epinglee:      { type: Boolean, default: false },
    usage:         { type: String, enum: ['salade', 'repas', 'tous'], default: 'salade' },
    portionGrammes:{ type: Number, min: 1, default: 100 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

IngredientSchema.virtual('stockLevel').get(function (this: IIngredient): StockLevel {
  if (this.stock <= 0)                       return 'rupture';
  if (this.stock <= this.stockMin * 0.5)    return 'critique';
  if (this.stock <= this.stockMin)           return 'faible';
  return 'normal';
});

IngredientSchema.virtual('margePercent').get(function (this: IIngredient): number {
  if (!this.prixVente) return 0;
  return Math.round(((this.prixVente - this.prixAchat) / this.prixVente) * 100);
});

IngredientSchema.index({ categorie: 1 });
IngredientSchema.index({ actif: 1 });
IngredientSchema.index({ stock: 1 });

export default mongoose.model<IIngredient>('Ingredient', IngredientSchema);
