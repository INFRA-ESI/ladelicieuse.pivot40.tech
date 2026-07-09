import mongoose, { Schema, Document, Types } from 'mongoose';

// ── Slugify (sans dépendance externe) ─────────────────────────────────────────
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface IMealIngredient {
  ingredientId?: Types.ObjectId;
  nom: string;
  quantite: number;
  unite: string;
  // Champs enrichis pour la fiche produit
  image?: string;
  description?: string;
  apportNutritif?: string;
  calories?: number;
}

// Format de vente optionnel (ex: "1L" à 1000 FCFA, "250ml" à 500 FCFA).
// Un produit sans formats conserve son prix unique existant (prix/prixPromo) — comportement inchangé.
export interface IMealFormat {
  label: string;
  prix: number;
  disponible: boolean;
}

export interface IMeal extends Document {
  // ─ Identité ─────────────────────────────────────────────────────────────
  nom: string;
  slug: string;
  categorieId: Types.ObjectId | null;
  categorie: string;
  // ─ Descriptions ─────────────────────────────────────────────────────────
  description: string;
  descriptionCourte: string;
  // ─ Prix ─────────────────────────────────────────────────────────────────
  prix: number;
  prixPromo: number | null;
  // Formats de vente optionnels (quantités avec prix propre) — vide par défaut
  formats: IMealFormat[];
  // ─ Médias ───────────────────────────────────────────────────────────────
  image: string;
  galerie: string[];
  // ─ Composition ──────────────────────────────────────────────────────────
  ingredients: IMealIngredient[];
  // ─ Nutrition (étendue) ──────────────────────────────────────────────────
  nutrition: {
    calories: number;
    proteines: number;
    glucides: number;
    lipides: number;
    fibres: number;
    sucres: number;
    sodium: number;
  };
  // ─ Attributs fiche produit ───────────────────────────────────────────────
  bienfaits: string[];
  allergenes: string[];
  objectifsSante: string[];
  conseilsConsommation: string[];
  // ─ Flags ────────────────────────────────────────────────────────────────
  popular: boolean;
  vedette: boolean;
  recommande: boolean;
  saisonnier: boolean;
  disponible: boolean;
  // ─ Logistique ───────────────────────────────────────────────────────────
  date: string | null;
  portions: number;
  portion: string;
  tempsPrepMin: number;
  // ─ Timestamps ───────────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
}

// ── Sous-schémas ──────────────────────────────────────────────────────────────

const MealIngredientSchema = new Schema<IMealIngredient>(
  {
    ingredientId:  { type: Schema.Types.ObjectId, ref: 'Ingredient', default: null },
    nom:           { type: String, required: true },
    quantite:      { type: Number, required: true, min: 0 },
    unite:         { type: String, default: 'g' },
    image:         { type: String, default: '' },
    description:   { type: String, default: '' },
    apportNutritif:{ type: String, default: '' },
    calories:      { type: Number, default: 0 },
  },
  { _id: false },
);

const MealFormatSchema = new Schema<IMealFormat>(
  {
    label:      { type: String, required: true, trim: true, maxlength: 40 },
    prix:       { type: Number, required: true, min: 0 },
    disponible: { type: Boolean, default: true },
  },
  { _id: false },
);

// ── Schéma principal ──────────────────────────────────────────────────────────

const MealSchema = new Schema<IMeal>(
  {
    nom:              { type: String, required: true, trim: true },
    slug:             { type: String, unique: true, sparse: true, lowercase: true },
    categorieId:      { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    categorie:        { type: String, required: true },
    description:      { type: String, default: '' },
    descriptionCourte:{ type: String, default: '' },
    prix:             { type: Number, required: true, min: 0 },
    prixPromo:        { type: Number, default: null },
    formats:          { type: [MealFormatSchema], default: [] },
    image:            { type: String, default: '' },
    galerie:          { type: [String], default: [] },
    ingredients:      { type: [MealIngredientSchema], default: [] },
    nutrition: {
      calories:  { type: Number, default: 0 },
      proteines: { type: Number, default: 0 },
      glucides:  { type: Number, default: 0 },
      lipides:   { type: Number, default: 0 },
      fibres:    { type: Number, default: 0 },
      sucres:    { type: Number, default: 0 },
      sodium:    { type: Number, default: 0 },
    },
    bienfaits:           { type: [String], default: [] },
    allergenes:          { type: [String], default: [] },
    objectifsSante:      { type: [String], default: [] },
    conseilsConsommation:{ type: [String], default: [] },
    popular:    { type: Boolean, default: false },
    vedette:    { type: Boolean, default: false },
    recommande: { type: Boolean, default: false },
    saisonnier: { type: Boolean, default: false },
    disponible: { type: Boolean, default: true },
    date:       { type: String, default: null },
    portions:   { type: Number, default: 1, min: 1 },
    portion:    { type: String, default: '' },
    tempsPrepMin:{ type: Number, default: 0 },
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────

MealSchema.index({ slug: 1 });
MealSchema.index({ categorieId: 1 });
MealSchema.index({ disponible: 1 });
MealSchema.index({ popular: -1 });
MealSchema.index({ vedette: -1 });
MealSchema.index({ date: 1 });

export default mongoose.model<IMeal>('Meal', MealSchema);
