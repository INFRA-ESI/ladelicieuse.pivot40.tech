import mongoose, { Schema, Document } from 'mongoose';

interface IZoneLivraison {
  label: string;
  keywords: string[];
  frais: number;
}

export const ZONES_DEFAULT: IZoneLivraison[] = [
  { label: 'Owendo',            keywords: ['owendo'],                                                                                                         frais: 3000 },
  { label: 'Akanda',            keywords: ['akanda'],                                                                                                         frais: 3000 },
  { label: 'Angondjé',          keywords: ['angondje', 'angondjé'],                                                                                           frais: 3000 },
  { label: 'Plein-Ciel',        keywords: ['plein-ciel', 'plein ciel', 'pleinciel'],                                                                          frais: 3000 },
  { label: 'Avorbam',           keywords: ['avorbam'],                                                                                                        frais: 3000 },
  { label: 'Bikélé',            keywords: ['bikele', 'bikélé'],                                                                                               frais: 3000 },
  { label: 'Nzeng-Ayong',       keywords: ['nzeng-ayong', 'nzeng ayong', 'nzeng'],                                                                            frais: 3000 },
  { label: 'Aworongane',        keywords: ['aworongane'],                                                                                                     frais: 3000 },
  { label: 'Mindoubé',          keywords: ['mindoube', 'mindoubé'],                                                                                           frais: 3000 },
  { label: 'Alibandeng',        keywords: ['alibandeng'],                                                                                                     frais: 3000 },
  { label: 'Cité Scientifique', keywords: ['cite scientifique', 'cité scientifique'],                                                                         frais: 3000 },
  { label: 'Zone PK5+',         keywords: ['pk5','pk 5','pk6','pk 6','pk7','pk 7','pk8','pk 8','pk9','pk 9','pk10','pk 10','pk11','pk 11','pk12','pk 12','pk13','pk 13','pk14','pk 14','pk15','pk 15'], frais: 3000 },
];

export const SLOTS_DEFAULT: string[] = [
  '09h00','10h00','11h00','12h00','13h00','14h00','15h00','16h00','17h00','18h00','19h00','20h00',
];

interface IEtape {
  num: string;
  titre: string;
  description: string;
}

export interface ISettings extends Document {
  nom: string;
  email: string;
  tel: string;
  adresse: string;
  ouverture: string;
  fermeture: string;
  livraison: boolean;
  fraisLivraison: number;
  livraisonGratuite: number;
  devise: string;
  notifEmail: boolean;
  notifWhatsApp: boolean;
  notifSms: boolean;
  adminPasswordHash?: string;
  zonesLivraison: IZoneLivraison[];
  creneauxLivraison: string[];
  etapesConsultation: IEtape[];
  etapesAbonnement: IEtape[];
  dieteticienNom: string;
  dieteticienTitre: string;
  dieteticienBio: string;
  dieteticienExperience: string;
  dieteticienCredentials: string[];
  dieteticienPhoto: string;
  videoPresentation: string;
  updatedAt: Date;
}

const ZoneSchema = new Schema<IZoneLivraison>(
  { label: String, keywords: [String], frais: { type: Number, default: 2000 } },
  { _id: false }
);

const EtapeSchema = new Schema<IEtape>(
  { num: String, titre: String, description: String },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    nom:               { type: String, default: 'La Délicieuse Diète' },
    email:             { type: String, default: 'ladelicieuse.1@gmail.com' },
    tel:               { type: String, default: '+241 76 35 90 20' },
    adresse:           { type: String, default: 'Quartier Louis, Libreville, Gabon' },
    ouverture:         { type: String, default: '08:00' },
    fermeture:         { type: String, default: '21:00' },
    livraison:         { type: Boolean, default: true },
    fraisLivraison:    { type: Number, default: 2000 },
    livraisonGratuite: { type: Number, default: 15000 },
    devise:            { type: String, default: 'FCFA' },
    notifEmail:        { type: Boolean, default: true },
    notifWhatsApp:     { type: Boolean, default: true },
    notifSms:          { type: Boolean, default: false },
    adminPasswordHash: { type: String, select: false },
    zonesLivraison:    { type: [ZoneSchema], default: () => ZONES_DEFAULT },
    creneauxLivraison: { type: [String],     default: () => [...SLOTS_DEFAULT] },
    etapesConsultation:      { type: [EtapeSchema], default: [] },
    etapesAbonnement:        { type: [EtapeSchema], default: [] },
    dieteticienNom:          { type: String,   default: 'Dr. Carlos BATTY' },
    dieteticienTitre:        { type: String,   default: 'Diététicien nutritionniste' },
    dieteticienBio:          { type: String,   default: 'Diététicien nutritionniste spécialisé en sécurité alimentaire, le Dr. BATTY accompagne ses patients gabonais vers une alimentation saine, équilibrée et adaptée à leurs réalités culturelles et médicales.' },
    dieteticienExperience:   { type: String,   default: '10+' },
    dieteticienCredentials:  { type: [String], default: ['Master en Sciences de l\'Alimentation et Nutrition', 'Spécialisation en sécurité alimentaire appliquée', 'Prise en charge des maladies métaboliques et chroniques', 'Suivi nutritionnel périnatal (grossesse & post-partum)'] },
    dieteticienPhoto:        { type: String,   default: '' },
    videoPresentation:       { type: String,   default: '' },
  },
  { timestamps: true }
);

export default mongoose.model<ISettings>('Settings', SettingsSchema);
