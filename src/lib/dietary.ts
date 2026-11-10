// Préférences alimentaires d'un client, confrontées à la composition d'un produit.
// La carte ne porte pas d'étiquette « végétarien » ou « halal » : on lit les allergènes déclarés, les valeurs
// nutritionnelles et les noms des ingrédients. Un ingrédient inconnu ne bloque jamais — le résultat dit
// « rien ne s'y oppose d'après la composition affichée », pas « garanti ».

export const PREFERENCE_KEYS = [
  'vegetarien', 'vegan', 'sans_gluten', 'sans_lactose',
  'halal', 'sans_porc', 'low_carb', 'riche_proteines',
] as const;

export type PrefKey = (typeof PREFERENCE_KEYS)[number];

export const PREFERENCE_LABELS: Record<PrefKey, string> = {
  vegetarien: 'Végétarien',
  vegan: 'Vegan',
  sans_gluten: 'Sans gluten',
  sans_lactose: 'Sans lactose',
  halal: 'Halal',
  sans_porc: 'Sans porc',
  low_carb: 'Low-carb',
  riche_proteines: 'Riche en protéines',
};

export interface DietSubject {
  name?: string;
  /** Noms des ingrédients. */
  ingredients?: string[];
  /** Clés d'allergènes déclarées dans l'admin : gluten, lait, oeufs, poisson, crustaces… */
  allergenes?: string[];
  /** Pour une portion, en grammes. Absent ou nul = inconnu. */
  proteines?: number;
  glucides?: number;
}

const normalize = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

const matcher = (words: string[]): RegExp => new RegExp(`\\b(?:${words.join('|')})s?\\b`);

const MEAT = matcher(['poulet', 'boeuf', 'veau', 'agneau', 'mouton', 'porc', 'jambon', 'lard', 'bacon', 'saucisse', 'saucisson',
  'dinde', 'canard', 'steak', 'viande', 'charcuterie', 'merguez', 'chorizo', 'boudin', 'rillette', 'pancetta', 'gigot', 'cote', 'escalope']);
const FISH = matcher(['poisson', 'thon', 'saumon', 'crevette', 'gambas', 'sardine', 'maquereau', 'morue', 'calamar', 'crabe',
  'homard', 'anchois', 'tilapia', 'capitaine', 'silure', 'dorade', 'bar', 'fruits de mer']);
const PORK = matcher(['porc', 'jambon', 'lard', 'bacon', 'saucisson', 'chorizo', 'boudin', 'rillette', 'pancetta', 'charcuterie']);
const ALCOHOL = matcher(['vin', 'biere', 'rhum', 'whisky', 'alcool', 'liqueur', 'cognac', 'champagne', 'vodka']);
const DAIRY = matcher(['lait', 'fromage', 'feta', 'mozzarella', 'parmesan', 'beurre', 'yaourt', 'yogourt', 'ricotta', 'chevre',
  'emmental', 'cheddar', 'whey', 'creme fraiche', 'creme liquide', 'creme']);
const EGG_HONEY = matcher(['oeuf', 'omelette', 'miel', 'mayonnaise', 'gelatine']);
const GLUTEN = matcher(['ble', 'farine', 'pain', 'pate', 'pates', 'couscous', 'boulgour', 'semoule', 'orge', 'seigle', 'avoine',
  'crouton', 'pizza', 'tortilla', 'wrap', 'biscuit', 'panure', 'seitan']);

const LOW_CARB_MAX_G = 30;
const PROTEIN_MIN_G = 20;

// « Pâtes sans gluten », « sans porc »… : la mention annule l'ingrédient qui la précède. « Crème de coco » n'est pas laitière.
const cleaned = (text: string): string => text.replace(/(?:\w+\s+)?\bsans\s+\w+/g, ' ').replace(/\bcreme (?:de|d) coco\b|\blait (?:de|d) coco\b|\bcoco\b/g, ' ');

/** Les raisons pour lesquelles ce produit ne convient pas à ces préférences. Liste vide = rien ne s'y oppose. */
export function dietConflicts(subject: DietSubject, preferences: readonly PrefKey[]): string[] {
  if (preferences.length === 0) return [];
  const text = cleaned(normalize([subject.name ?? '', ...(subject.ingredients ?? [])].join(' ; ')));
  const allergens = new Set((subject.allergenes ?? []).map(normalize));
  const has = (re: RegExp) => re.test(text);
  const reasons: string[] = [];
  const add = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };

  for (const pref of preferences) {
    switch (pref) {
      case 'vegetarien':
        if (has(MEAT) || has(FISH) || allergens.has('poisson') || allergens.has('crustaces')) add('contient de la viande ou du poisson');
        break;
      case 'vegan':
        if (has(MEAT) || has(FISH) || allergens.has('poisson') || allergens.has('crustaces')) add('contient de la viande ou du poisson');
        else if (has(DAIRY) || has(EGG_HONEY) || allergens.has('lait') || allergens.has('oeufs')) add('contient des produits animaux (lait, œufs, miel)');
        break;
      case 'sans_gluten':
        if (allergens.has('gluten') || has(GLUTEN)) add('contient du gluten');
        break;
      case 'sans_lactose':
        if (allergens.has('lait') || has(DAIRY)) add('contient du lait');
        break;
      case 'sans_porc':
        if (has(PORK)) add('contient du porc');
        break;
      case 'halal':
        if (has(PORK)) add('contient du porc');
        else if (has(ALCOHOL)) add("contient de l'alcool");
        break;
      case 'low_carb':
        if (subject.glucides && subject.glucides > LOW_CARB_MAX_G) add(`${Math.round(subject.glucides)} g de glucides par portion`);
        break;
      case 'riche_proteines':
        if (subject.proteines !== undefined && subject.proteines > 0 && subject.proteines < PROTEIN_MIN_G) add(`seulement ${Math.round(subject.proteines)} g de protéines par portion`);
        break;
    }
  }
  return reasons;
}

export const isPrefKey = (value: unknown): value is PrefKey =>
  typeof value === 'string' && (PREFERENCE_KEYS as readonly string[]).includes(value);
