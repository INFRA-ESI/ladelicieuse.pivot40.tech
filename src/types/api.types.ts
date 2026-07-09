// Types renvoyés par l'API backend — miroir des modèles Mongoose

export interface ApiCategory {
  _id: string;
  nom: string;
  description: string;
  image: string;
  active: boolean;
  ordre: number;
}

// Ingrédient enrichi pour la fiche produit
export interface ApiProductIngredient {
  nom: string;
  quantite: number;
  unite: string;
  image?: string;
  description?: string;
  apportNutritif?: string;
  calories?: number;
}

// Format de vente optionnel (ex: "1L" à 1000 FCFA, "250ml" à 500 FCFA)
export interface ApiMealFormat {
  label: string;
  prix: number;
  disponible?: boolean;
}

// ApiMeal — rétrocompatible + nouveaux champs fiche produit
export interface ApiMeal {
  _id: string;
  nom: string;
  slug?: string;
  categorie: string;
  description: string;
  descriptionCourte?: string;
  prix: number;
  prixPromo?: number | null;
  formats?: ApiMealFormat[];
  image: string;
  galerie?: string[];
  ingredients: ApiProductIngredient[];
  nutrition: {
    calories: number;
    proteines: number;
    glucides: number;
    lipides: number;
    fibres: number;
    sucres?: number;
    sodium?: number;
  };
  bienfaits?: string[];
  allergenes?: string[];
  objectifsSante?: string[];
  conseilsConsommation?: string[];
  popular: boolean;
  vedette?: boolean;
  recommande?: boolean;
  saisonnier?: boolean;
  disponible: boolean;
  portions: number;
  portion?: string;
  tempsPrepMin?: number;
  date?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Alias sémantique pour les pages de fiches produits
export type ApiProduct = ApiMeal;

export interface ApiIngredient {
  _id: string;
  nom: string;
  categorie: string;
  image: string;
  unite: string;
  stock: number;
  stockMin: number;
  prixAchat: number;
  prixVente: number;
  nutrition: { calories: number; proteines: number; glucides: number; lipides: number; fibres: number };
  actif: boolean;
  stockLevel: string;
}

export interface ApiPromotion {
  _id: string;
  nom: string;
  type: 'pourcentage' | 'fixe' | 'bundle' | 'flash';
  valeur: number;
  categories: string[];
  dateDebut: string;
  dateFin: string;
  active: boolean;
}

export interface ApiDailyMenu {
  _id: string;
  date: string;
  repas: ApiMeal[];
  published: boolean;
}
