// Données des ingrédients pour la personnalisation de salades
export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  caloriesPer100g: number;
  portionGrams: number;
  caloriesPerPortion: number;
  pricePerPortion: number;
  benefits: string;
  image: string;
  inStock: boolean;
}

export type IngredientCategory = 
  | 'base' 
  | 'legume' 
  | 'proteine' 
  | 'garniture' 
  | 'sauce' 
  | 'fruit';

// Format de vente optionnel (ex: "1L" à 1000 FCFA, "250ml" à 500 FCFA).
// Un jus sans formats garde son prix unique (`price`) — comportement inchangé.
export interface JuiceFormat {
  label: string;
  price: number;
}

export interface JuiceProduct {
  id: string;
  name: string;
  description: string;
  calories: number;
  price: number;
  benefits: string[];
  type: 'detox' | 'fruit';
  image?: string;
  formats?: JuiceFormat[];
}

// Identifiant stable pour une pastille de format côté panier/URL (sans accents, sans espaces).
export function slugifyFormatLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'format';
}

export interface MealProduct {
  id: string;
  name: string;
  description: string;
  composition: string[];
  caloriesPerPortion: number;
  portions: number;
  price: number;
  image?: string;
  category: string;
}

export interface CartItem {
  id: string;
  type: 'salade' | 'jus' | 'repas' | 'consultation';
  name: string;
  items?: { ingredient: Ingredient; quantity: number }[];
  product?: JuiceProduct | MealProduct;
  totalCalories: number;
  totalPrice: number;
  quantity: number;
}

export const INGREDIENTS: Ingredient[] = [
  // Bases
  { id: 'laitue', name: 'Laitue', category: 'base', caloriesPer100g: 15, portionGrams: 80, caloriesPerPortion: 12, pricePerPortion: 300, benefits: 'Riche en fibres et en eau, favorise la digestion', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png', inStock: true },
  { id: 'roquette', name: 'Roquette', category: 'base', caloriesPer100g: 25, portionGrams: 60, caloriesPerPortion: 15, pricePerPortion: 400, benefits: 'Source de vitamine K et de calcium', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png', inStock: true },
  { id: 'epinard', name: 'Épinard', category: 'base', caloriesPer100g: 23, portionGrams: 70, caloriesPerPortion: 16, pricePerPortion: 350, benefits: 'Riche en fer et en antioxydants', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png', inStock: true },
  
  // Légumes
  { id: 'tomate', name: 'Tomate cerise', category: 'legume', caloriesPer100g: 18, portionGrams: 80, caloriesPerPortion: 14, pricePerPortion: 350, benefits: 'Riche en lycopène, un puissant antioxydant', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08d13jm00070cjl1sip2mdx.png', inStock: true },
  { id: 'concombre', name: 'Concombre', category: 'legume', caloriesPer100g: 12, portionGrams: 60, caloriesPerPortion: 7, pricePerPortion: 250, benefits: 'Hydratant, faible en calories', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088fr3f00000dl64umf9vst.png', inStock: true },
  { id: 'carotte', name: 'Carotte râpée', category: 'legume', caloriesPer100g: 41, portionGrams: 50, caloriesPerPortion: 20, pricePerPortion: 250, benefits: 'Source de bêta-carotène pour la vue', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm06zmedo00040cjo62ys5fvi.png', inStock: true },
  { id: 'avocat', name: 'Avocat', category: 'legume', caloriesPer100g: 160, portionGrams: 50, caloriesPerPortion: 80, pricePerPortion: 600, benefits: 'Riche en bons lipides et en potassium', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96av4qr000504kyh5wz8dln.jpg', inStock: true },
  { id: 'poivron', name: 'Poivron', category: 'legume', caloriesPer100g: 26, portionGrams: 60, caloriesPerPortion: 16, pricePerPortion: 350, benefits: 'Très riche en vitamine C', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm4ph243o00020cmk6taw3pdx.jpg', inStock: true },
  { id: 'oignon', name: 'Oignon rouge', category: 'legume', caloriesPer100g: 40, portionGrams: 30, caloriesPerPortion: 12, pricePerPortion: 200, benefits: 'Propriétés anti-inflammatoires', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bjb2t000k0cl87q1ub4ag.png', inStock: true },
  { id: 'mais', name: 'Maïs', category: 'legume', caloriesPer100g: 86, portionGrams: 40, caloriesPerPortion: 34, pricePerPortion: 300, benefits: 'Source de fibres et d\'énergie', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088lq2t00050cl2apbp4dmb.png', inStock: true },
  
  // Protéines
  { id: 'poulet', name: 'Poulet grillé', category: 'proteine', caloriesPer100g: 165, portionGrams: 100, caloriesPerPortion: 165, pricePerPortion: 1200, benefits: 'Excellente source de protéines maigres', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cmgagxd5n000d04ksahig9crj.png', inStock: true },
  { id: 'oeuf', name: 'Œuf dur', category: 'proteine', caloriesPer100g: 155, portionGrams: 60, caloriesPerPortion: 93, pricePerPortion: 400, benefits: 'Protéines complètes, riche en choline', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088ivsf00010cl6g90raaw7.png', inStock: true },
  { id: 'thon', name: 'Thon', category: 'proteine', caloriesPer100g: 130, portionGrams: 80, caloriesPerPortion: 104, pricePerPortion: 1000, benefits: 'Riche en oméga-3 et en protéines', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm085ql9b00010cl7goao3gpv.png', inStock: true },
  { id: 'fromage', name: 'Feta', category: 'proteine', caloriesPer100g: 264, portionGrams: 30, caloriesPerPortion: 79, pricePerPortion: 500, benefits: 'Source de calcium et de probiotiques', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cmbeo39uc000004l75gec4mb1.png', inStock: true },
  
  // Garnitures
  { id: 'graines-tournesol', name: 'Graines de tournesol', category: 'garniture', caloriesPer100g: 584, portionGrams: 15, caloriesPerPortion: 88, pricePerPortion: 300, benefits: 'Riche en vitamine E et en sélénium', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg', inStock: true },
  { id: 'noix', name: 'Noix', category: 'garniture', caloriesPer100g: 654, portionGrams: 15, caloriesPerPortion: 98, pricePerPortion: 400, benefits: 'Oméga-3, bon pour le cerveau', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg', inStock: true },
  { id: 'croutons', name: 'Croûtons', category: 'garniture', caloriesPer100g: 407, portionGrams: 20, caloriesPerPortion: 81, pricePerPortion: 250, benefits: 'Apporte du croquant et des glucides', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm5s6fhwx000103mh4g9x38ad.jpg', inStock: true },
  { id: 'olive', name: 'Olives noires', category: 'garniture', caloriesPer100g: 115, portionGrams: 20, caloriesPerPortion: 23, pricePerPortion: 350, benefits: 'Riche en fer et en bons lipides', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg', inStock: true },
  
  // Sauces
  { id: 'vinaigrette', name: 'Vinaigrette maison', category: 'sauce', caloriesPer100g: 150, portionGrams: 20, caloriesPerPortion: 30, pricePerPortion: 200, benefits: 'Aide à l\'absorption des vitamines', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cme5fq6sq000404kw44uc55gt.png', inStock: true },
  { id: 'huile-olive', name: 'Huile d\'olive', category: 'sauce', caloriesPer100g: 900, portionGrams: 10, caloriesPerPortion: 90, pricePerPortion: 200, benefits: 'Riche en polyphénols et en acides gras mono-insaturés', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cme5fq6sq000404kw44uc55gt.png', inStock: true },
  { id: 'citron', name: 'Jus de citron', category: 'sauce', caloriesPer100g: 22, portionGrams: 15, caloriesPerPortion: 3, pricePerPortion: 150, benefits: 'Vitamine C, aide à l\'immunité', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm086jyxt00030cmhcildhwnd.png', inStock: true },
  { id: 'sauce-yaourt', name: 'Sauce au yaourt', category: 'sauce', caloriesPer100g: 60, portionGrams: 30, caloriesPerPortion: 18, pricePerPortion: 300, benefits: 'Probiotiques, bon pour la flore intestinale', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm086l8iq00070cmcc7d6gj3i.png', inStock: true },
  
  // Fruits (pour salades de fruits)
  { id: 'mangue', name: 'Mangue', category: 'fruit', caloriesPer100g: 60, portionGrams: 80, caloriesPerPortion: 48, pricePerPortion: 500, benefits: 'Vitamine A et C, antioxydant puissant', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bwj5e0004nk3ag8xn1kjc.png', inStock: true },
  { id: 'ananas', name: 'Ananas', category: 'fruit', caloriesPer100g: 50, portionGrams: 80, caloriesPerPortion: 40, pricePerPortion: 400, benefits: 'Bromélaïne, aide à la digestion', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08brc1u00000cl504xu0pf6.png', inStock: true },
  { id: 'fraise', name: 'Fraises', category: 'fruit', caloriesPer100g: 33, portionGrams: 80, caloriesPerPortion: 26, pricePerPortion: 500, benefits: 'Riche en vitamine C et en antioxydants', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bmair000r0cib731od0d8.png', inStock: true },
  { id: 'banane', name: 'Banane', category: 'fruit', caloriesPer100g: 89, portionGrams: 80, caloriesPerPortion: 71, pricePerPortion: 300, benefits: 'Potassium, énergie rapide', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bfahb00020cl68itz1xuw.png', inStock: true },
  { id: 'papaye', name: 'Papaye', category: 'fruit', caloriesPer100g: 43, portionGrams: 80, caloriesPerPortion: 34, pricePerPortion: 450, benefits: 'Enzymes digestives, vitamines A et C', image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bue9r00000cl469c33s4k.png', inStock: true },
];

export const JUICES: JuiceProduct[] = [
  // Jus détox
  { id: 'detox-vert',             name: 'Détox Verte',              description: 'Concombre, épinard, citron vert, gingembre, menthe',                       calories: 85,  price: 2500, benefits: ['Détoxification', 'Énergie naturelle', 'Anti-inflammatoire'],  type: 'detox', image: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=600&q=80' },
  { id: 'detox-citron-gingembre', name: 'Élixir Citron-Gingembre',  description: 'Citron, gingembre frais, curcuma, miel',                                  calories: 95,  price: 2500, benefits: ['Boost immunitaire', 'Anti-inflammatoire', 'Digestion'],         type: 'detox', image: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?auto=format&fit=crop&w=600&q=80' },
  { id: 'detox-betterave',        name: 'Rouge Vitalité',           description: 'Betterave, carotte, pomme, gingembre',                                     calories: 120, price: 2500, benefits: ['Circulation sanguine', 'Énergie', 'Antioxydants'],               type: 'detox', image: 'https://images.unsplash.com/photo-1596568894591-36ef3185df2e?auto=format&fit=crop&w=600&q=80' },
  { id: 'detox-papaye',           name: 'Détox Papaye-Menthe',      description: 'Papaye fraîche, menthe, citron vert, gingembre',                           calories: 90,  price: 2500, benefits: ['Digestion', 'Détoxification', 'Vitamines A et C'],               type: 'detox', image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=600&q=80' },
  { id: 'detox-celeri',           name: 'Vert Intense',             description: 'Céleri, concombre, pomme verte, citron, persil',                           calories: 70,  price: 2500, benefits: ['Alcalinisant', 'Drainage', 'Clarté mentale'],                    type: 'detox', image: 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80' },
  // Jus de fruits pressés
  { id: 'jus-pastèque',          name: 'Pastèque Fraîcheur',        description: 'Pastèque pressée, menthe fraîche, citron vert',                           calories: 75,  price: 2000, benefits: ['Hydratation', 'Vitamines A et C', 'Rafraîchissant'],            type: 'fruit', image: 'https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=600&q=80' },
  { id: 'jus-orange',             name: 'Oranges Pressées du Jour', description: 'Oranges fraîches pressées minute',                                         calories: 110, price: 1500, benefits: ['Vitamine C', 'Énergie matinale', 'Immunité'],                    type: 'fruit', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=600&q=80' },
  { id: 'jus-ananas-coco',        name: 'Tropical Ananas-Coco',     description: 'Ananas frais, lait de coco, citron vert',                                  calories: 140, price: 2500, benefits: ['Digestion', 'Hydratation', 'Énergie tropicale'],                 type: 'fruit', image: 'https://images.unsplash.com/photo-1498511952655-6ef5b0066e1c?auto=format&fit=crop&w=600&q=80' },
  { id: 'jus-mangue',             name: 'Mangue Pressée',           description: 'Mangue fraîche pressée, zeste de citron vert',                             calories: 130, price: 2000, benefits: ['Vitamine A', 'Énergie', 'Antioxydants'],                         type: 'fruit', image: 'https://images.unsplash.com/photo-1622825439750-b5b02f3c51d7?auto=format&fit=crop&w=600&q=80' },
  { id: 'jus-cocktail',           name: 'Cocktail de Fruits Maison',description: 'Orange, ananas, maracuja, mangue — pressés à la commande',                calories: 155, price: 2500, benefits: ['Multi-vitamines', 'Énergie', 'Immunité'],                       type: 'fruit', image: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80' },
  { id: 'jus-goyave',             name: 'Goyave Fraîche',           description: 'Goyave pressée, citron, pincée de sel rose',                               calories: 100, price: 2000, benefits: ['Vitamine C', 'Fer', 'Fibres'],                                  type: 'fruit', image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80' },
];

export const MEALS: MealProduct[] = [
  // Repas équilibrés
  { id: 'poulet-riz',     category: 'equilibre', name: 'Poulet Grillé & Riz Basmati',   description: 'Poulet mariné aux herbes, riz basmati parfumé, légumes de saison rôtis',           composition: ['Riz basmati', 'Poulet grillé', 'Carottes', 'Brocoli'],         caloriesPerPortion: 420, portions: 2, price: 4500, image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80' },
  { id: 'poisson-quinoa', category: 'equilibre', name: 'Poisson & Quinoa aux Herbes',   description: 'Filet de poisson grillé, quinoa aux herbes fraîches, salade verte',                composition: ['Quinoa', 'Poisson grillé', 'Herbes fraîches', 'Salade'],       caloriesPerPortion: 380, portions: 2, price: 5000, image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80' },
  { id: 'bowl-veggie',    category: 'equilibre', name: 'Bowl Végétarien Complet',        description: 'Patate douce rôtie, pois chiches épicés, avocat, riz complet',                     composition: ['Riz complet', 'Patate douce', 'Pois chiches', 'Avocat'],       caloriesPerPortion: 450, portions: 2, price: 4000, image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80' },
  // Repas chauds
  { id: 'poulet-roti',    category: 'chaud',     name: 'Poulet Rôti & Légumes Chauds',  description: 'Poulet rôti aux épices douces, légumes racines caramélisés, sauce aux herbes',     composition: ['Poulet rôti', 'Carottes', 'Pommes de terre', 'Sauce herbes'],  caloriesPerPortion: 480, portions: 2, price: 5500, image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?auto=format&fit=crop&w=600&q=80' },
  { id: 'ragout-legumes', category: 'chaud',     name: 'Ragoût de Légumes du Marché',   description: 'Légumes frais du marché mijotés, sauce tomate maison, riz ou igname',              composition: ['Légumes de saison', 'Sauce tomate', 'Épices', 'Riz ou igname'],caloriesPerPortion: 350, portions: 2, price: 3500, image: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=600&q=80' },
  // Omelettes
  { id: 'omelette-herbes',category: 'omelette',  name: 'Omelette aux Herbes & Légumes', description: 'Omelette moelleuse aux herbes fraîches, tomates, poivrons, oignons caramélisés',  composition: ['Œufs', 'Herbes fraîches', 'Tomates', 'Poivrons'],              caloriesPerPortion: 280, portions: 1, price: 2500, image: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=600&q=80' },
  { id: 'omelette-poulet',category: 'omelette',  name: 'Omelette Poulet-Épinards',      description: 'Omelette garnie de poulet effiloché, épinards sautés et feta',                    composition: ['Œufs', 'Poulet effiloché', 'Épinards', 'Feta'],                caloriesPerPortion: 340, portions: 1, price: 3000, image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80' },
  // Soupes
  { id: 'soupe-legumes',  category: 'soupe',     name: 'Soupe de Légumes du Jardin',    description: 'Bouillon de légumes maison, carottes, courgettes, poireaux, herbes fraîches',     composition: ['Carottes', 'Courgettes', 'Poireaux', 'Herbes'],                caloriesPerPortion: 150, portions: 2, price: 2000, image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80' },
  { id: 'soupe-tomate',   category: 'soupe',     name: 'Velouté Tomate & Basilic',      description: 'Velouté de tomates fraîches, basilic, crème de coco légère',                      composition: ['Tomates fraîches', 'Basilic', 'Coco légère', 'Épices'],        caloriesPerPortion: 180, portions: 2, price: 2000, image: 'https://images.unsplash.com/photo-1576577445504-6af96477db52?auto=format&fit=crop&w=600&q=80' },
  { id: 'soupe-poulet',   category: 'soupe',     name: 'Bouillon de Poulet Maison',     description: 'Bouillon de poulet mijoté, légumes croquants, vermicelles de riz',                composition: ['Poulet', 'Légumes', 'Vermicelles de riz', 'Épices douces'],    caloriesPerPortion: 220, portions: 2, price: 2500, image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=600&q=80' },
];

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  base: 'Bases vertes',
  legume: 'Légumes',
  proteine: 'Protéines',
  garniture: 'Garnitures',
  sauce: 'Sauces',
  fruit: 'Fruits',
};

export function formatPrice(priceFCFA: number): string {
  return new Intl.NumberFormat('fr-FR').format(priceFCFA) + ' FCFA';
}
