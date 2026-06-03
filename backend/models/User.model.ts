import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { encryptNumber, decryptNumber } from '../utils/aes256.js';

// ── Champs de santé chiffrés en AES-256-GCM ────────────────────────────────────
// Ces champs sont stockés sous forme de chaîne chiffrée en base, mais exposés
// comme number dans l'interface TypeScript grâce aux hooks pre/post.
const HEALTH_FIELDS = [
  'taille', 'objectifPoids', 'objectifCalories',
  'objectifProteines', 'objectifGlucides', 'objectifLipides', 'objectifEau',
] as const;

// ── Interface TypeScript ────────────────────────────────────────────────────────

export interface IUser extends Document {
  nom: string;
  prenoms: string;
  email: string;
  password: string;
  telephone: string;
  adresse: string;
  points: number;
  tier: 'bronze' | 'argent' | 'or' | 'platine';
  statut: 'actif' | 'inactif';
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  subscription?: {
    planId: string;
    planName: string;
    status: 'active' | 'paused' | 'cancelled';
    billing: 'monthly' | 'annual';
    startDate: Date;
    endDate: Date;
  };
  // Suivi diététique — chiffrés AES-256-GCM en base, exposés comme number
  taille?:            number;
  objectifPoids?:     number;
  objectifCalories?:  number;
  objectifProteines?: number;
  objectifGlucides?:  number;
  objectifLipides?:   number;
  objectifEau?:       number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

// ── Schéma ────────────────────────────────────────────────────────────────────
// Les champs de santé sont Mixed (acceptent string chiffrée ou number legacy).
// Les validateurs min/max sont retirés : la validation est faite en amont (routes).

const UserSchema = new Schema<IUser>(
  {
    nom:       { type: String, required: true, trim: true },
    prenoms:   { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:  { type: String, default: '' },
    telephone: { type: String, default: '', trim: true },
    adresse:   { type: String, default: '' },
    points:    { type: Number, default: 0, min: 0 },
    tier:      { type: String, enum: ['bronze', 'argent', 'or', 'platine'], default: 'bronze' },
    statut:    { type: String, enum: ['actif', 'inactif'], default: 'inactif' },
    emailVerified:            { type: Boolean, default: false },
    emailVerificationToken:   { type: String },
    emailVerificationExpires: { type: Date },
    passwordResetToken:       { type: String },
    passwordResetExpires:     { type: Date },
    subscription: {
      planId:    String,
      planName:  String,
      status:    { type: String, enum: ['active', 'paused', 'cancelled'] },
      billing:   { type: String, enum: ['monthly', 'annual'] },
      startDate: Date,
      endDate:   Date,
    },
    // Stockés chiffrés → type Mixed (string chiffrée en production, number legacy possible)
    taille:            { type: Schema.Types.Mixed },
    objectifPoids:     { type: Schema.Types.Mixed },
    objectifCalories:  { type: Schema.Types.Mixed },
    objectifProteines: { type: Schema.Types.Mixed },
    objectifGlucides:  { type: Schema.Types.Mixed },
    objectifLipides:   { type: Schema.Types.Mixed },
    objectifEau:       { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

UserSchema.index({ statut: 1 });

// ── Chiffrement avant sauvegarde (create + save) ──────────────────────────────

UserSchema.pre('save', async function (next) {
  // 1. Hash du mot de passe (inchangé)
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // 2. Chiffrement des champs de santé si la valeur est un number (non encore chiffré)
  for (const field of HEALTH_FIELDS) {
    const val = this.get(field);
    if (typeof val === 'number') {
      this.set(field, encryptNumber(val));
    }
  }

  next();
});

// ── Chiffrement lors des mises à jour (findByIdAndUpdate / findOneAndUpdate) ───

function encryptHealthInUpdate(update: Record<string, unknown>): void {
  // Supporte { field: value } et { $set: { field: value } }
  const targets = [update, (update as Record<string, Record<string, unknown>>).$set].filter(Boolean);
  for (const obj of targets) {
    for (const field of HEALTH_FIELDS) {
      const val = obj[field];
      if (typeof val === 'number') {
        obj[field] = encryptNumber(val);
      }
    }
  }
}

UserSchema.pre('findOneAndUpdate', function () {
  const upd = this.getUpdate() as Record<string, unknown> | null;
  if (upd) encryptHealthInUpdate(upd);
});

UserSchema.pre('updateOne', function () {
  const upd = this.getUpdate() as Record<string, unknown> | null;
  if (upd) encryptHealthInUpdate(upd);
});

// ── Déchiffrement après lecture ────────────────────────────────────────────────

function decryptHealthFields(doc: Record<string, unknown>): void {
  for (const field of HEALTH_FIELDS) {
    const val = doc[field];
    if (val != null) {
      doc[field] = decryptNumber(val);
    }
  }
}

// post('init') s'exécute après hydratation d'un document Mongoose (find, findOne, etc.)
UserSchema.post('init', function (doc) {
  decryptHealthFields(doc as unknown as Record<string, unknown>);
});

// Pour findOneAndUpdate avec { new: true } (retourne le document mis à jour)
UserSchema.post('findOneAndUpdate', function (doc) {
  if (doc) decryptHealthFields(doc as unknown as Record<string, unknown>);
});

// ── Méthodes ──────────────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export function computeTier(points: number): IUser['tier'] {
  if (points >= 3500) return 'platine';
  if (points >= 1500) return 'or';
  if (points >= 500)  return 'argent';
  return 'bronze';
}

export default mongoose.model<IUser>('User', UserSchema);
