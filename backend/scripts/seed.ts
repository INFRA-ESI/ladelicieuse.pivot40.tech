import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';
import Ingredient from '../models/Ingredient.model.js';
import Meal from '../models/Meal.model.js';
import Suggestion from '../models/Suggestion.model.js';
import Consultation from '../models/Consultation.model.js';
import Plan from '../models/Plan.model.js';
import FAQ from '../models/FAQ.model.js';
import Testimonial from '../models/Testimonial.model.js';
import Settings from '../models/Settings.model.js';
import LoyaltyReward from '../models/LoyaltyReward.model.js';
import FideliteTier from '../models/FideliteTier.model.js';

const MONGO_URI = process.env.MONGO_URI!;
if (!MONGO_URI) { console.error('MONGO_URI manquant'); process.exit(1); }

// ── 1. Catégories ─────────────────────────────────────────────────────────────

// Catégories d'ingrédients — utilisées dans IngredientsPage et MenuDayPage
const CATEGORIES = [
  { nom: 'Bases',      description: 'Feuilles et bases de salade : laitue, roquette, épinard', ordre: 1 },
  { nom: 'Légumes',    description: 'Légumes frais de saison : tomate, concombre, carotte, avocat', ordre: 2 },
  { nom: 'Protéines',  description: 'Sources de protéines : poulet grillé, thon, œuf dur, feta', ordre: 3 },
  { nom: 'Garnitures', description: 'Toppings et garnitures : graines, noix, croûtons, olives', ordre: 4 },
  { nom: 'Sauces',     description: 'Vinaigrettes, sauces et assaisonnements maison', ordre: 5 },
  { nom: 'Fruits',     description: 'Fruits frais tropicaux : mangue, ananas, fraise, banane, papaye', ordre: 6 },
];

// ── 2. Ingrédients ────────────────────────────────────────────────────────────

const INGREDIENTS = [
  // Bases
  { nom: 'Laitue',              categorie: 'Bases',      prixVente: 300,  prixAchat: 180, stock: 80,  nutrition: { calories: 15,  proteines: 1.4, glucides: 2.9, lipides: 0.2, fibres: 1.3 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png' },
  { nom: 'Roquette',            categorie: 'Bases',      prixVente: 400,  prixAchat: 240, stock: 60,  nutrition: { calories: 25,  proteines: 2.6, glucides: 3.7, lipides: 0.7, fibres: 1.6 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png' },
  { nom: 'Épinard',             categorie: 'Bases',      prixVente: 350,  prixAchat: 210, stock: 70,  nutrition: { calories: 23,  proteines: 2.9, glucides: 3.6, lipides: 0.4, fibres: 2.2 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088uxmh00030dkz2d4xgx06.png' },
  // Légumes
  { nom: 'Tomate cerise',       categorie: 'Légumes',    prixVente: 350,  prixAchat: 200, stock: 100, nutrition: { calories: 18,  proteines: 0.9, glucides: 3.9, lipides: 0.2, fibres: 1.2 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08d13jm00070cjl1sip2mdx.png' },
  { nom: 'Concombre',           categorie: 'Légumes',    prixVente: 250,  prixAchat: 150, stock: 80,  nutrition: { calories: 12,  proteines: 0.6, glucides: 2.2, lipides: 0.1, fibres: 0.7 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088fr3f00000dl64umf9vst.png' },
  { nom: 'Carotte râpée',       categorie: 'Légumes',    prixVente: 250,  prixAchat: 150, stock: 90,  nutrition: { calories: 41,  proteines: 0.9, glucides: 9.6, lipides: 0.2, fibres: 2.8 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm06zmedo00040cjo62ys5fvi.png' },
  { nom: 'Avocat',              categorie: 'Légumes',    prixVente: 600,  prixAchat: 360, stock: 50,  nutrition: { calories: 160, proteines: 2.0, glucides: 9.0, lipides: 15,  fibres: 7.0 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96av4qr000504kyh5wz8dln.jpg' },
  { nom: 'Poivron',             categorie: 'Légumes',    prixVente: 350,  prixAchat: 210, stock: 70,  nutrition: { calories: 26,  proteines: 1.0, glucides: 6.0, lipides: 0.3, fibres: 2.1 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm4ph243o00020cmk6taw3pdx.jpg' },
  { nom: 'Oignon rouge',        categorie: 'Légumes',    prixVente: 200,  prixAchat: 120, stock: 100, nutrition: { calories: 40,  proteines: 1.1, glucides: 9.3, lipides: 0.1, fibres: 1.7 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bjb2t000k0cl87q1ub4ag.png' },
  { nom: 'Maïs',                categorie: 'Légumes',    prixVente: 300,  prixAchat: 180, stock: 80,  nutrition: { calories: 86,  proteines: 3.3, glucides: 19,  lipides: 1.2, fibres: 2.7 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088lq2t00050cl2apbp4dmb.png' },
  // Protéines
  { nom: 'Poulet grillé',       categorie: 'Protéines',  prixVente: 1200, prixAchat: 700, stock: 40,  nutrition: { calories: 165, proteines: 31,  glucides: 0,   lipides: 3.6, fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cmgagxd5n000d04ksahig9crj.png' },
  { nom: 'Œuf dur',             categorie: 'Protéines',  prixVente: 400,  prixAchat: 240, stock: 60,  nutrition: { calories: 155, proteines: 13,  glucides: 1.1, lipides: 11,  fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm088ivsf00010cl6g90raaw7.png' },
  { nom: 'Thon',                categorie: 'Protéines',  prixVente: 1000, prixAchat: 600, stock: 30,  nutrition: { calories: 130, proteines: 30,  glucides: 0,   lipides: 1.0, fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm085ql9b00010cl7goao3gpv.png' },
  { nom: 'Feta',                categorie: 'Protéines',  prixVente: 500,  prixAchat: 300, stock: 40,  nutrition: { calories: 264, proteines: 14,  glucides: 4.1, lipides: 21,  fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cmbeo39uc000004l75gec4mb1.png' },
  // Garnitures
  { nom: 'Graines de tournesol',categorie: 'Garnitures', prixVente: 300,  prixAchat: 180, stock: 50,  nutrition: { calories: 584, proteines: 21,  glucides: 20,  lipides: 51,  fibres: 8.6 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg' },
  { nom: 'Noix',                categorie: 'Garnitures', prixVente: 400,  prixAchat: 240, stock: 40,  nutrition: { calories: 654, proteines: 15,  glucides: 14,  lipides: 65,  fibres: 6.7 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg' },
  { nom: 'Croûtons',            categorie: 'Garnitures', prixVente: 250,  prixAchat: 150, stock: 60,  nutrition: { calories: 407, proteines: 13,  glucides: 73,  lipides: 7.6, fibres: 3.5 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm5s6fhwx000103mh4g9x38ad.jpg' },
  { nom: 'Olives noires',       categorie: 'Garnitures', prixVente: 350,  prixAchat: 210, stock: 40,  nutrition: { calories: 115, proteines: 0.8, glucides: 6.3, lipides: 11,  fibres: 3.2 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm96232qi000304kzdwkn2o18.jpg' },
  // Sauces
  { nom: 'Vinaigrette maison',  categorie: 'Sauces',     prixVente: 200,  prixAchat: 100, stock: 50,  nutrition: { calories: 150, proteines: 0.2, glucides: 3.0, lipides: 15,  fibres: 0.1 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cme5fq6sq000404kw44uc55gt.png' },
  { nom: "Huile d'olive",       categorie: 'Sauces',     prixVente: 200,  prixAchat: 100, stock: 50,  nutrition: { calories: 900, proteines: 0,   glucides: 0,   lipides: 100, fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cme5fq6sq000404kw44uc55gt.png' },
  { nom: 'Jus de citron',       categorie: 'Sauces',     prixVente: 150,  prixAchat: 80,  stock: 60,  nutrition: { calories: 22,  proteines: 0.4, glucides: 6.9, lipides: 0.2, fibres: 0.3 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm086jyxt00030cmhcildhwnd.png' },
  { nom: 'Sauce au yaourt',     categorie: 'Sauces',     prixVente: 300,  prixAchat: 150, stock: 50,  nutrition: { calories: 60,  proteines: 3.5, glucides: 4.7, lipides: 3.0, fibres: 0   }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm086l8iq00070cmcc7d6gj3i.png' },
  // Fruits
  { nom: 'Mangue',              categorie: 'Fruits',     prixVente: 500,  prixAchat: 300, stock: 60,  nutrition: { calories: 60,  proteines: 0.8, glucides: 15,  lipides: 0.4, fibres: 1.6 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bwj5e0004nk3ag8xn1kjc.png' },
  { nom: 'Ananas',              categorie: 'Fruits',     prixVente: 400,  prixAchat: 240, stock: 50,  nutrition: { calories: 50,  proteines: 0.5, glucides: 13,  lipides: 0.1, fibres: 1.4 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08brc1u00000cl504xu0pf6.png' },
  { nom: 'Fraises',             categorie: 'Fruits',     prixVente: 500,  prixAchat: 300, stock: 40,  nutrition: { calories: 33,  proteines: 0.7, glucides: 7.7, lipides: 0.3, fibres: 2.0 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bmair000r0cib731od0d8.png' },
  { nom: 'Banane',              categorie: 'Fruits',     prixVente: 300,  prixAchat: 180, stock: 70,  nutrition: { calories: 89,  proteines: 1.1, glucides: 23,  lipides: 0.3, fibres: 2.6 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bfahb00020cl68itz1xuw.png' },
  { nom: 'Papaye',              categorie: 'Fruits',     prixVente: 450,  prixAchat: 270, stock: 50,  nutrition: { calories: 43,  proteines: 0.5, glucides: 11,  lipides: 0.3, fibres: 1.7 }, image: 'https://emofly.b-cdn.net/hbd_exvhac6ayb3ZKT/width:1080/plain/https://storage.googleapis.com/takeapp/media/cm08bue9r00000cl469c33s4k.png' },
];

// ── 3. Repas ──────────────────────────────────────────────────────────────────

const MEALS = [
  // Repas équilibrés
  {
    nom: 'Poulet Grillé & Riz Basmati', categorie: 'Repas Équilibrés',
    description: 'Poulet mariné aux herbes, riz basmati parfumé, légumes de saison rôtis',
    prix: 4500, portions: 2, popular: true,
    nutrition: { calories: 420, proteines: 38, glucides: 45, lipides: 8, fibres: 4 },
    ingredients: [{ nom: 'Riz basmati', quantite: 150, unite: 'g' }, { nom: 'Poulet grillé', quantite: 150, unite: 'g' }, { nom: 'Carottes', quantite: 80, unite: 'g' }, { nom: 'Brocoli', quantite: 80, unite: 'g' }],
    // Poulet grillé avec accompagnements — plat complet vu de dessus
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Poisson & Quinoa aux Herbes', categorie: 'Repas Équilibrés',
    description: 'Filet de poisson grillé, quinoa aux herbes fraîches, salade verte',
    prix: 5000, portions: 2, popular: true,
    nutrition: { calories: 380, proteines: 35, glucides: 38, lipides: 7, fibres: 5 },
    ingredients: [{ nom: 'Quinoa', quantite: 120, unite: 'g' }, { nom: 'Poisson grillé', quantite: 150, unite: 'g' }, { nom: 'Herbes fraîches', quantite: 20, unite: 'g' }, { nom: 'Salade verte', quantite: 60, unite: 'g' }],
    // Filet de poisson grillé sur assiette
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Bowl Végétarien Complet', categorie: 'Repas Équilibrés',
    description: 'Patate douce rôtie, pois chiches épicés, avocat, riz complet',
    prix: 4000, portions: 2, popular: true,
    nutrition: { calories: 450, proteines: 15, glucides: 65, lipides: 14, fibres: 12 },
    ingredients: [{ nom: 'Riz complet', quantite: 120, unite: 'g' }, { nom: 'Patate douce', quantite: 100, unite: 'g' }, { nom: 'Pois chiches', quantite: 80, unite: 'g' }, { nom: 'Avocat', quantite: 50, unite: 'g' }],
    // Bowl végétarien coloré vu de dessus — avocat, légumes, grains
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
  },
  // Repas chauds
  {
    nom: 'Poulet Rôti & Légumes Chauds', categorie: 'Repas Chauds',
    description: 'Poulet rôti aux épices douces, légumes racines caramélisés, sauce aux herbes',
    prix: 5500, portions: 2, popular: false,
    nutrition: { calories: 480, proteines: 40, glucides: 30, lipides: 18, fibres: 6 },
    ingredients: [{ nom: 'Poulet rôti', quantite: 180, unite: 'g' }, { nom: 'Carottes', quantite: 80, unite: 'g' }, { nom: 'Pommes de terre', quantite: 100, unite: 'g' }, { nom: 'Sauce herbes', quantite: 30, unite: 'g' }],
    // Poulet rôti doré sur plat de service
    image: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Ragoût de Légumes du Marché', categorie: 'Repas Chauds',
    description: 'Légumes frais du marché mijotés, sauce tomate maison, riz ou igname',
    prix: 3500, portions: 2, popular: false,
    nutrition: { calories: 350, proteines: 10, glucides: 55, lipides: 8, fibres: 9 },
    ingredients: [{ nom: 'Légumes de saison', quantite: 200, unite: 'g' }, { nom: 'Sauce tomate', quantite: 100, unite: 'g' }, { nom: 'Épices', quantite: 5, unite: 'g' }, { nom: 'Riz ou igname', quantite: 120, unite: 'g' }],
    // Ragoût de légumes mijoté dans une cocotte
    image: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=600&q=80',
  },
  // Omelettes
  {
    nom: 'Omelette aux Herbes & Légumes', categorie: 'Omelettes',
    description: 'Omelette moelleuse aux herbes fraîches, tomates, poivrons, oignons caramélisés',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 280, proteines: 18, glucides: 8, lipides: 19, fibres: 2 },
    ingredients: [{ nom: 'Œufs', quantite: 3, unite: 'pièce' }, { nom: 'Herbes fraîches', quantite: 10, unite: 'g' }, { nom: 'Tomates', quantite: 60, unite: 'g' }, { nom: 'Poivrons', quantite: 50, unite: 'g' }],
    // Omelette moelleuse aux herbes dans une poêle
    image: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Omelette Poulet-Épinards', categorie: 'Omelettes',
    description: 'Omelette garnie de poulet effiloché, épinards sautés et feta',
    prix: 3000, portions: 1, popular: false,
    nutrition: { calories: 340, proteines: 28, glucides: 5, lipides: 22, fibres: 2 },
    ingredients: [{ nom: 'Œufs', quantite: 3, unite: 'pièce' }, { nom: 'Poulet effiloché', quantite: 80, unite: 'g' }, { nom: 'Épinards', quantite: 60, unite: 'g' }, { nom: 'Feta', quantite: 30, unite: 'g' }],
    // Omelette garnie dorée servie en assiette
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
  },
  // Soupes
  {
    nom: 'Soupe de Légumes du Jardin', categorie: 'Soupes & Bouillons',
    description: 'Bouillon de légumes maison, carottes, courgettes, poireaux, herbes fraîches',
    prix: 2000, portions: 2, popular: false,
    nutrition: { calories: 150, proteines: 5, glucides: 22, lipides: 3, fibres: 5 },
    ingredients: [{ nom: 'Carottes', quantite: 80, unite: 'g' }, { nom: 'Courgettes', quantite: 80, unite: 'g' }, { nom: 'Poireaux', quantite: 60, unite: 'g' }, { nom: 'Herbes fraîches', quantite: 10, unite: 'g' }],
    // Bouillon de légumes clair avec légumes visibles
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Velouté Tomate & Basilic', categorie: 'Soupes & Bouillons',
    description: 'Velouté de tomates fraîches, basilic, crème de coco légère',
    prix: 2000, portions: 2, popular: false,
    nutrition: { calories: 180, proteines: 4, glucides: 28, lipides: 5, fibres: 4 },
    ingredients: [{ nom: 'Tomates fraîches', quantite: 200, unite: 'g' }, { nom: 'Basilic', quantite: 10, unite: 'g' }, { nom: 'Coco légère', quantite: 50, unite: 'g' }, { nom: 'Épices', quantite: 5, unite: 'g' }],
    // Velouté de tomate rouge vif dans un bol blanc
    image: 'https://images.unsplash.com/photo-1576577445504-6af96477db52?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Bouillon de Poulet Maison', categorie: 'Soupes & Bouillons',
    description: 'Bouillon de poulet mijoté, légumes croquants, vermicelles de riz',
    prix: 2500, portions: 2, popular: false,
    nutrition: { calories: 220, proteines: 18, glucides: 25, lipides: 5, fibres: 3 },
    ingredients: [{ nom: 'Poulet', quantite: 120, unite: 'g' }, { nom: 'Légumes', quantite: 100, unite: 'g' }, { nom: 'Vermicelles de riz', quantite: 60, unite: 'g' }, { nom: 'Épices douces', quantite: 5, unite: 'g' }],
    // Bouillon de poulet doré avec légumes dans un bol
    image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=600&q=80',
  },
  // Jus détox
  {
    nom: 'Détox Verte', categorie: 'Jus Détox',
    description: 'Concombre, épinard, citron vert, gingembre, menthe',
    prix: 2500, portions: 1, popular: true,
    nutrition: { calories: 85, proteines: 2, glucides: 18, lipides: 0.5, fibres: 3 },
    ingredients: [{ nom: 'Concombre', quantite: 100, unite: 'g' }, { nom: 'Épinard', quantite: 60, unite: 'g' }, { nom: 'Citron vert', quantite: 30, unite: 'g' }, { nom: 'Gingembre', quantite: 10, unite: 'g' }],
    // Jus vert détox dans un verre avec menthe et citron
    image: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Élixir Citron-Gingembre', categorie: 'Jus Détox',
    description: 'Citron, gingembre frais, curcuma, miel',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 95, proteines: 1, glucides: 22, lipides: 0.3, fibres: 1 },
    ingredients: [{ nom: 'Citron', quantite: 60, unite: 'g' }, { nom: 'Gingembre frais', quantite: 15, unite: 'g' }, { nom: 'Curcuma', quantite: 5, unite: 'g' }, { nom: 'Miel', quantite: 10, unite: 'g' }],
    // Boisson jaune-dorée citron-gingembre avec tranches de citron
    image: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Rouge Vitalité', categorie: 'Jus Détox',
    description: 'Betterave, carotte, pomme, gingembre',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 120, proteines: 2, glucides: 28, lipides: 0.3, fibres: 3 },
    ingredients: [{ nom: 'Betterave', quantite: 80, unite: 'g' }, { nom: 'Carotte râpée', quantite: 80, unite: 'g' }, { nom: 'Pomme', quantite: 80, unite: 'g' }, { nom: 'Gingembre', quantite: 10, unite: 'g' }],
    // Jus rouge betterave-carotte dans un verre
    image: 'https://images.unsplash.com/photo-1596568894591-36ef3185df2e?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Détox Papaye-Menthe', categorie: 'Jus Détox',
    description: 'Papaye fraîche, menthe, citron vert, gingembre',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 90, proteines: 1, glucides: 21, lipides: 0.3, fibres: 2 },
    ingredients: [{ nom: 'Papaye', quantite: 120, unite: 'g' }, { nom: 'Menthe', quantite: 10, unite: 'g' }, { nom: 'Citron vert', quantite: 30, unite: 'g' }, { nom: 'Gingembre', quantite: 10, unite: 'g' }],
    // Smoothie papaye-orange tropical dans un verre avec menthe
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Vert Intense', categorie: 'Jus Détox',
    description: 'Céleri, concombre, pomme verte, citron, persil',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 70, proteines: 1, glucides: 15, lipides: 0.3, fibres: 2 },
    ingredients: [{ nom: 'Céleri', quantite: 80, unite: 'g' }, { nom: 'Concombre', quantite: 80, unite: 'g' }, { nom: 'Pomme verte', quantite: 80, unite: 'g' }, { nom: 'Persil', quantite: 10, unite: 'g' }],
    // Jus vert intense dans une carafe avec glaçons
    image: 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80',
  },
  // Jus de fruits
  {
    nom: 'Pastèque Fraîcheur', categorie: 'Jus de Fruits',
    description: 'Pastèque pressée, menthe fraîche, citron vert',
    prix: 2000, portions: 1, popular: true,
    nutrition: { calories: 75, proteines: 1, glucides: 18, lipides: 0.2, fibres: 1 },
    ingredients: [{ nom: 'Pastèque', quantite: 200, unite: 'g' }, { nom: 'Menthe fraîche', quantite: 10, unite: 'g' }, { nom: 'Citron vert', quantite: 20, unite: 'g' }],
    // Jus de pastèque rose dans un grand verre avec menthe
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Oranges Pressées du Jour', categorie: 'Jus de Fruits',
    description: 'Oranges fraîches pressées minute',
    prix: 1500, portions: 1, popular: true,
    nutrition: { calories: 110, proteines: 2, glucides: 26, lipides: 0.5, fibres: 1 },
    ingredients: [{ nom: 'Oranges fraîches', quantite: 250, unite: 'g' }],
    // Jus d'orange pressé frais avec demi-oranges
    image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Tropical Ananas-Coco', categorie: 'Jus de Fruits',
    description: 'Ananas frais, lait de coco, citron vert',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 140, proteines: 1, glucides: 32, lipides: 2, fibres: 2 },
    ingredients: [{ nom: 'Ananas', quantite: 150, unite: 'g' }, { nom: 'Lait de coco', quantite: 60, unite: 'g' }, { nom: 'Jus de citron', quantite: 20, unite: 'g' }],
    // Boisson tropicale ananas-coco blanc crémeux dans un verre
    image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Mangue Pressée', categorie: 'Jus de Fruits',
    description: 'Mangue fraîche pressée, zeste de citron vert',
    prix: 2000, portions: 1, popular: false,
    nutrition: { calories: 130, proteines: 1, glucides: 31, lipides: 0.5, fibres: 2 },
    ingredients: [{ nom: 'Mangue', quantite: 200, unite: 'g' }, { nom: 'Jus de citron', quantite: 15, unite: 'g' }],
    // Jus/smoothie mangue orange vif dans un verre
    image: 'https://images.unsplash.com/photo-1546548970-71785318a17b?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Cocktail de Fruits Maison', categorie: 'Jus de Fruits',
    description: 'Orange, ananas, maracuja, mangue — pressés à la commande',
    prix: 2500, portions: 1, popular: false,
    nutrition: { calories: 155, proteines: 2, glucides: 36, lipides: 0.5, fibres: 2 },
    ingredients: [{ nom: 'Orange', quantite: 80, unite: 'g' }, { nom: 'Ananas', quantite: 80, unite: 'g' }, { nom: 'Maracuja', quantite: 40, unite: 'g' }, { nom: 'Mangue', quantite: 80, unite: 'g' }],
    // Cocktail de jus colorés tropicaux dans un grand verre
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Goyave Fraîche', categorie: 'Jus de Fruits',
    description: 'Goyave pressée, citron, pincée de sel rose',
    prix: 2000, portions: 1, popular: false,
    nutrition: { calories: 100, proteines: 2, glucides: 23, lipides: 0.5, fibres: 5 },
    ingredients: [{ nom: 'Goyave', quantite: 200, unite: 'g' }, { nom: 'Jus de citron', quantite: 15, unite: 'g' }],
    // Jus de goyave rose pâle dans un verre
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80',
  },
];

// ── 4. Suggestions du chef ────────────────────────────────────────────────────

const SUGGESTIONS = [
  // Salades de crudités
  {
    nom: 'Salade César',
    description: 'La classique revisitée — laitue croquante, poulet grillé, parmesan et croûtons maison.',
    type: 'crudites' as const,
    base: 'laitue',
    ingredients: ['Laitue', 'Poulet grillé', 'Feta', 'Croûtons', 'Vinaigrette maison'],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Bowl Détox',
    description: 'Roquette, avocat crémeux, thon, tomates cerise et citron pressé.',
    type: 'crudites' as const,
    base: 'roquette',
    ingredients: ['Roquette', 'Avocat', 'Thon', 'Tomate cerise', 'Jus de citron'],
    // Salade verte avec avocat et légumes frais
    image: 'https://images.unsplash.com/photo-1540189549336-e6e99eb4b53e?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Niçoise Gabonaise',
    description: 'Épinards frais, thon, œuf dur, olives noires et vinaigrette maison.',
    type: 'crudites' as const,
    base: 'epinard',
    ingredients: ['Épinard', 'Thon', 'Œuf dur', 'Olives noires', 'Vinaigrette maison'],
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Power Bowl Protéiné',
    description: 'Laitue, poulet grillé, œuf dur, maïs, graines de tournesol et sauce yaourt.',
    type: 'crudites' as const,
    base: 'laitue',
    ingredients: ['Laitue', 'Poulet grillé', 'Œuf dur', 'Maïs', 'Graines de tournesol', 'Sauce au yaourt'],
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?auto=format&fit=crop&w=600&q=80',
  },
  // Salades de fruits
  {
    nom: 'Tropical Mix',
    description: 'Mangue, ananas et papaye — l\'évasion tropicale dans votre assiette.',
    type: 'fruits' as const,
    base: 'mangue',
    ingredients: ['Mangue', 'Ananas', 'Papaye'],
    // Salade de fruits tropicaux colorés : mangue, ananas, papaye
    image: 'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Fruits Rouges & Banane',
    description: 'Fraises juteuses et banane fondante pour un dessert vitaminé.',
    type: 'fruits' as const,
    base: 'fraise',
    ingredients: ['Fraises', 'Banane', 'Mangue'],
    // Fraises et fruits rouges frais dans un bol
    image: 'https://images.unsplash.com/photo-1519996529931-28324d5a630e?auto=format&fit=crop&w=600&q=80',
  },
  {
    nom: 'Exotique Complet',
    description: 'Ananas, papaye, banane et mangue — toute la richesse des fruits du Gabon.',
    type: 'fruits' as const,
    base: 'ananas',
    ingredients: ['Ananas', 'Papaye', 'Banane', 'Mangue'],
    // Plateau de fruits exotiques variés vu de dessus
    image: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=600&q=80',
  },
];

// ── 5. Consultations ──────────────────────────────────────────────────────────

const CONSULTATIONS_DATA = [
  { titre: 'Perte de poids équilibrée',   description: 'Plan alimentaire sur mesure pour maigrir durablement, sans frustration ni carence nutritionnelle.', prix: 15000, duree: '60 min', tag: 'Populaire',   ordre: 1, image: 'https://images.unsplash.com/photo-1490818387583-1baba5e638af?auto=format&fit=crop&w=600&q=80' },
  { titre: 'Prise de masse saine',        description: 'Programme nutritionnel pour prendre du poids et renforcer la masse musculaire de façon équilibrée.', prix: 15000, duree: '60 min', tag: '',            ordre: 2, image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80' },
  { titre: 'Maladie chronique',           description: 'Suivi diététique spécialisé : diabète, hypertension, obésité et autres pathologies métaboliques.',   prix: 15000, duree: '60 min', tag: 'Spécialisé',  ordre: 3, image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80' },
  { titre: 'Femme enceinte',              description: 'Accompagnement nutritionnel adapté à chaque trimestre pour la santé de la mère et du bébé.',          prix: 15000, duree: '60 min', tag: '',            ordre: 4, image: 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?auto=format&fit=crop&w=600&q=80' },
  { titre: 'Consultation express',        description: 'Avis nutritionnel ciblé et réponses rapides à vos questions urgentes en alimentation.',              prix: 15000, duree: '30 min', tag: 'Rapide',      ordre: 5, image: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80' },
  { titre: 'Bilan & Suivi personnalisé',  description: 'Bilan nutritionnel complet, objectifs chiffrés et suivi mensuel de vos progrès.',                    prix: 15000, duree: '90 min', tag: 'Complet',     ordre: 6, image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80' },
];

// ── 6. Plans d'abonnement ─────────────────────────────────────────────────────

const PLANS_DATA = [
  {
    nom: 'Essentiel', description: 'Idéal pour adopter une routine saine, sans contrainte ni engagement.',
    prixHebdo: 7800, prixMensuel: 25000, tag: 'Pour commencer', icone: 'leaf', populaire: false, ordre: 1,
    features: [
      { texte: '4 salades personnalisées / mois',  inclus: true  },
      { texte: '2 jus détox / mois',               inclus: true  },
      { texte: 'Livraison offerte',                inclus: true  },
      { texte: 'Compteur de calories',             inclus: true  },
      { texte: 'Repas équilibrés inclus',          inclus: false },
      { texte: 'Suivi nutritionnel',               inclus: false },
      { texte: 'Consultation diététicien',         inclus: false },
    ],
  },
  {
    nom: 'Vitalité', description: 'Alimentation complète au quotidien — salades, jus, repas et suivi inclus.',
    prixHebdo: 14100, prixMensuel: 45000, tag: 'Le plus choisi', icone: 'zap', populaire: true, ordre: 2,
    features: [
      { texte: '8 salades personnalisées / mois',   inclus: true  },
      { texte: '4 jus détox / mois',                inclus: true  },
      { texte: 'Livraison prioritaire offerte',     inclus: true  },
      { texte: 'Compteur de calories',              inclus: true  },
      { texte: '2 repas équilibrés / mois',         inclus: true  },
      { texte: 'Accès au suivi nutritionnel',       inclus: true  },
      { texte: 'Consultation diététicien',          inclus: false },
    ],
  },
  {
    nom: 'Premium', description: 'Tout inclus, illimité — avec coaching nutritionnel et consultation mensuelle.',
    prixHebdo: 23400, prixMensuel: 75000, tag: "L'expérience totale", icone: 'crown', populaire: false, ordre: 3,
    features: [
      { texte: 'Salades personnalisées illimitées', inclus: true },
      { texte: 'Jus illimités',                    inclus: true },
      { texte: 'Livraison express offerte',         inclus: true },
      { texte: 'Compteur de calories',              inclus: true },
      { texte: 'Repas équilibrés illimités',        inclus: true },
      { texte: 'Suivi nutritionnel personnalisé',   inclus: true },
      { texte: '1 consultation diététicien / mois', inclus: true },
    ],
  },
];

// ── 7. FAQs ───────────────────────────────────────────────────────────────────

const FAQS_DATA = [
  // Consultations
  { question: "Quelle est la durée d'une consultation standard ?", reponse: "Les consultations standard durent 60 minutes. La consultation express dure 30 minutes et le bilan complet peut aller jusqu'à 90 minutes selon le profil du patient.", page: 'consultations', ordre: 1 },
  { question: 'Les consultations se font-elles en présentiel ou en ligne ?', reponse: 'Les deux options sont disponibles. En présentiel au cabinet de Libreville (Quartier Louis) ou en téléconsultation via WhatsApp / visioconférence, selon votre préférence.', page: 'consultations', ordre: 2 },
  { question: 'Combien de séances sont généralement nécessaires ?', reponse: 'En moyenne, 3 à 6 séances suffisent pour un rééquilibrage alimentaire. Pour les maladies chroniques, un suivi mensuel sur 6 à 12 mois est recommandé pour des résultats durables.', page: 'consultations', ordre: 3 },
  { question: 'Que dois-je préparer avant ma consultation ?', reponse: 'Notez vos habitudes alimentaires des 3 derniers jours, vos antécédents médicaux et vos objectifs. Pour les maladies chroniques, apportez vos derniers bilans sanguins.', page: 'consultations', ordre: 4 },
  { question: "Les abonnés La Délicieuse Diète bénéficient-ils d'un avantage ?", reponse: 'Oui. Les abonnés Premium bénéficient d\'une consultation mensuelle incluse dans leur formule. Les abonnés Vitalité accèdent au suivi nutritionnel en ligne.', page: 'consultations', ordre: 5 },
  // Abonnement
  { question: 'Puis-je annuler à tout moment ?', reponse: 'Oui, sans engagement ni frais. Annulez ou mettez en pause depuis votre espace personnel avant le prochain renouvellement.', page: 'abonnement', ordre: 1 },
  { question: 'Comment fonctionne la livraison hebdomadaire ?', reponse: 'Chaque semaine, vous recevez une notification pour valider votre sélection. Votre commande est préparée le matin et livrée dans la journée dans tout Libreville.', page: 'abonnement', ordre: 2 },
  { question: "Puis-je changer de formule en cours d'abonnement ?", reponse: 'Absolument. Upgradez ou downgradez à tout moment. La différence est calculée au prorata.', page: 'abonnement', ordre: 3 },
  { question: 'Les abonnés cumulent-ils des points fidélité ?', reponse: 'Oui, et en bonus. Vitalité : points doublés. Premium : points triplés par rapport à la commande à la carte.', page: 'abonnement', ordre: 4 },
  { question: 'Les ingrédients sont-ils frais chaque semaine ?', reponse: 'Toujours. Nos ingrédients sont sélectionnés chaque matin au marché de Libreville. Aucun produit surgelé.', page: 'abonnement', ordre: 5 },
];

// ── 8. Témoignages ────────────────────────────────────────────────────────────

const TESTIMONIALS_DATA = [
  // Consultations
  { nom: 'Sandrine M.', texte: "Grâce au Dr. BATTY, j'ai perdu 8 kg en 3 mois sans me priver. Son approche bienveillante et ses conseils pratiques ont tout changé.", note: 5, page: 'consultations' },
  { nom: 'Jean-Claude O.', texte: "Diabétique depuis 4 ans, je n'avais jamais eu un suivi aussi personnalisé. Mon taux de glycémie est stable et je me sens en pleine forme.", note: 5, page: 'consultations' },
  { nom: 'Chloé A.', texte: "Le suivi grossesse m'a aidée à manger mieux sans stress. Mon bébé est né en parfaite santé et j'ai retrouvé mon poids rapidement après.", note: 5, page: 'consultations' },
  // Abonnement
  { nom: 'Marie-Claire O.', texte: "Depuis mon abonnement Vitalité, je ne me pose plus la question du déjeuner. Frais, goûteux, livré à l'heure.", note: 5, page: 'abonnement' },
  { nom: 'Franck N.', texte: 'La formule Premium avec la consultation diét. a vraiment changé mon rapport à l\'alimentation. Je recommande.', note: 5, page: 'abonnement' },
  { nom: 'Esther B.', texte: "Commencer par l'Essentiel était la meilleure décision. J'ai perdu 4 kg en 2 mois sans effort.", note: 5, page: 'abonnement' },
];

// ── 9. Settings (zones, créneaux, étapes) ─────────────────────────────────────

const ZONES_LIVRAISON = [
  { label: 'Owendo',           keywords: ['owendo'],                                                                                                        frais: 3000 },
  { label: 'Akanda',           keywords: ['akanda'],                                                                                                        frais: 3000 },
  { label: 'Angondjé',         keywords: ['angondje', 'angondjé'],                                                                                          frais: 3000 },
  { label: 'Plein-Ciel',       keywords: ['plein-ciel', 'plein ciel', 'pleinciel'],                                                                         frais: 3000 },
  { label: 'Avorbam',          keywords: ['avorbam'],                                                                                                       frais: 3000 },
  { label: 'Bikélé',           keywords: ['bikele', 'bikélé'],                                                                                              frais: 3000 },
  { label: 'Nzeng-Ayong',      keywords: ['nzeng-ayong', 'nzeng ayong', 'nzeng'],                                                                           frais: 3000 },
  { label: 'Aworongane',       keywords: ['aworongane'],                                                                                                    frais: 3000 },
  { label: 'Mindoubé',         keywords: ['mindoube', 'mindoubé'],                                                                                          frais: 3000 },
  { label: 'Alibandeng',       keywords: ['alibandeng'],                                                                                                    frais: 3000 },
  { label: 'Cité Scientifique',keywords: ['cite scientifique', 'cité scientifique'],                                                                        frais: 3000 },
  { label: 'Zone PK5+',        keywords: ['pk5','pk 5','pk6','pk 6','pk7','pk 7','pk8','pk 8','pk9','pk 9','pk10','pk 10','pk11','pk 11','pk12','pk 12','pk13','pk 13','pk14','pk 14','pk15','pk 15'], frais: 3000 },
];

const CRENEAUX_LIVRAISON = ['09h00', '10h00', '11h00', '12h00', '13h00', '14h00', '15h00', '16h00', '17h00', '18h00', '19h00', '20h00'];

const ETAPES_CONSULTATION = [
  { num: '01', titre: 'Réservation',        description: 'Choisissez votre type de consultation et un créneau disponible depuis cette page.' },
  { num: '02', titre: 'Anamnèse',           description: 'Échange sur vos habitudes alimentaires, antécédents médicaux et objectifs de santé.' },
  { num: '03', titre: 'Plan personnalisé',  description: 'Vous recevez un programme nutritionnel adapté à votre profil, vos goûts et votre mode de vie.' },
  { num: '04', titre: 'Suivi',              description: 'Des séances de suivi régulières pour ajuster le plan et maintenir la motivation dans la durée.' },
];

const ETAPES_ABONNEMENT = [
  { num: '01', titre: 'Choisissez',   description: 'Sélectionnez la formule qui correspond à votre rythme et vos objectifs santé.' },
  { num: '02', titre: 'Personnalisez',description: 'Chaque semaine, choisissez vos salades, jus et repas dans notre catalogue complet.' },
  { num: '03', titre: 'Recevez',      description: 'Vos préparations fraîches sont livrées à votre porte selon votre planning.' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Connexion à MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connecté.');

  // Categories — catégories d'ingrédients (remplace les anciennes catégories repas)
  console.log('\nSeed categories...');
  await Category.deleteMany({});
  for (const cat of CATEGORIES) {
    await Category.create(cat);
  }
  console.log(`  ${CATEGORIES.length} catégories ingrédients insérées`);

  // Ingredients
  console.log('\nSeed ingrédients...');
  for (const ing of INGREDIENTS) {
    await Ingredient.updateOne(
      { nom: ing.nom },
      {
        $set: {
          nom:          ing.nom,
          categorie:    ing.categorie,
          unite:        'portion',
          stock:        ing.stock,
          stockMin:     10,
          stockOptimal: 50,
          prixAchat:    ing.prixAchat,
          prixVente:    ing.prixVente,
          nutrition:    ing.nutrition,
          actif:        true,
        },
        $setOnInsert: { image: ing.image },
      },
      { upsert: true },
    );
  }
  console.log(`  ${INGREDIENTS.length} ingrédients insérés/mis à jour`);

  // Meals
  console.log('\nSeed repas & jus...');
  for (const meal of MEALS) {
    await Meal.updateOne(
      { nom: meal.nom },
      {
        $set: {
          nom:         meal.nom,
          categorie:   meal.categorie,
          description: meal.description,
          prix:        meal.prix,
          portions:    meal.portions,
          popular:     meal.popular,
          disponible:  true,
          nutrition:   meal.nutrition,
          ingredients: meal.ingredients,
          date:        null,
        },
        $setOnInsert: { image: meal.image },
      },
      { upsert: true },
    );
  }
  console.log(`  ${MEALS.length} repas/jus insérés/mis à jour`);

  // Suggestions
  console.log('\nSeed suggestions...');
  for (const s of SUGGESTIONS) {
    await Suggestion.updateOne(
      { nom: s.nom, type: s.type },
      { $set: { ...s, actif: true } },
      { upsert: true },
    );
  }
  console.log(`  ${SUGGESTIONS.length} suggestions insérées/mises à jour`);

  // Consultations
  console.log('\nSeed consultations...');
  for (const c of CONSULTATIONS_DATA) {
    await Consultation.updateOne({ titre: c.titre }, { $set: { ...c, actif: true } }, { upsert: true });
  }
  console.log(`  ${CONSULTATIONS_DATA.length} consultations insérées/mises à jour`);

  // Plans
  console.log('\nSeed plans d\'abonnement...');
  for (const p of PLANS_DATA) {
    await Plan.updateOne({ nom: p.nom }, { $set: { ...p, actif: true } }, { upsert: true });
  }
  console.log(`  ${PLANS_DATA.length} plans insérés/mis à jour`);

  // FAQs
  console.log('\nSeed FAQs...');
  for (const f of FAQS_DATA) {
    await FAQ.updateOne({ question: f.question, page: f.page }, { $set: { ...f, actif: true } }, { upsert: true });
  }
  console.log(`  ${FAQS_DATA.length} FAQs insérées/mises à jour`);

  // Témoignages
  console.log('\nSeed témoignages...');
  for (const t of TESTIMONIALS_DATA) {
    await Testimonial.updateOne(
      { nom: t.nom, page: t.page },
      { $set: { ...t, actif: true, source: 'admin', statut: 'approuve' } },
      { upsert: true },
    );
  }
  console.log(`  ${TESTIMONIALS_DATA.length} témoignages insérés/mis à jour`);

  // Niveaux fidélité (tiers)
  console.log('\nSeed niveaux fidélité...');
  const LOYALTY_TIERS = [
    { slug: 'bronze',  nom: 'Bronze',  pointsMin: 0,    pointsMax: 499,  couleur: 'bronze',  ordre: 1 },
    { slug: 'argent',  nom: 'Argent',  pointsMin: 500,  pointsMax: 1499, couleur: 'argent',  ordre: 2 },
    { slug: 'or',      nom: 'Or',      pointsMin: 1500, pointsMax: 3499, couleur: 'or',      ordre: 3 },
    { slug: 'platine', nom: 'Platine', pointsMin: 3500, pointsMax: null, couleur: 'platine', ordre: 4 },
  ];
  for (const t of LOYALTY_TIERS) {
    await FideliteTier.updateOne({ slug: t.slug }, { $set: t }, { upsert: true });
  }
  console.log(`  ${LOYALTY_TIERS.length} niveaux insérés/mis à jour`);

  // Récompenses fidélité
  console.log('\nSeed récompenses fidélité...');
  const LOYALTY_REWARDS = [
    { nom: 'Jus offert',           description: '1 jus de votre choix',       points: 500,  ordre: 1 },
    { nom: 'Salade offerte',       description: '1 salade simple offerte',     points: 800,  ordre: 2 },
    { nom: 'Réduction 2000 FCFA',  description: 'Bon de réduction 2000 FCFA', points: 1000, ordre: 3 },
    { nom: 'Repas complet offert', description: 'Repas + jus offerts',         points: 1500, ordre: 4 },
    { nom: 'Consultation diét.',   description: '1 consultation diététique',   points: 2500, ordre: 5 },
  ];
  for (const r of LOYALTY_REWARDS) {
    await LoyaltyReward.updateOne({ nom: r.nom }, { $set: { ...r, actif: true } }, { upsert: true });
  }
  console.log(`  ${LOYALTY_REWARDS.length} récompenses insérées/mises à jour`);

  // Settings — zones, créneaux, étapes
  console.log('\nSeed settings (zones, créneaux, étapes)...');
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  if (!settings.zonesLivraison || settings.zonesLivraison.length === 0) {
    settings.zonesLivraison = ZONES_LIVRAISON as typeof settings.zonesLivraison;
  }
  if (!settings.creneauxLivraison || settings.creneauxLivraison.length === 0) {
    settings.creneauxLivraison = CRENEAUX_LIVRAISON;
  }
  if (!settings.etapesConsultation || settings.etapesConsultation.length === 0) {
    settings.etapesConsultation = ETAPES_CONSULTATION as typeof settings.etapesConsultation;
  }
  if (!settings.etapesAbonnement || settings.etapesAbonnement.length === 0) {
    settings.etapesAbonnement = ETAPES_ABONNEMENT as typeof settings.etapesAbonnement;
  }
  await settings.save();
  console.log('  Settings zones/créneaux/étapes mis à jour');

  console.log('\nSeed terminé.');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Erreur seed:', err);
  process.exit(1);
});
