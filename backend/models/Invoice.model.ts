import mongoose, { Schema, Document, Types } from 'mongoose';

export type InvoiceStatus = 'payee' | 'en_attente' | 'annulee' | 'remboursee';

export interface IInvoiceItem {
  nom: string;
  qty: number;
  prixUnit: number;
  coutUnit: number;
}

export interface IInvoice extends Document {
  numero: string;
  client: string;
  email: string;
  telephone: string;
  orderId?: Types.ObjectId;
  items: IInvoiceItem[];
  statut: InvoiceStatus;
  modePaiement: string;
  notes: string;
  totalHT: number;
  tva: number;
  totalTTC: number;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema<IInvoiceItem>(
  {
    nom:      { type: String, required: true },
    qty:      { type: Number, required: true, min: 1 },
    prixUnit: { type: Number, required: true, min: 0 },
    coutUnit: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    numero:       { type: String, unique: true },
    client:       { type: String, required: true, trim: true },
    email:        { type: String, required: true, lowercase: true },
    telephone:    { type: String, default: '' },
    orderId:      { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    items:        { type: [InvoiceItemSchema], required: true },
    statut:       { type: String, enum: ['payee','en_attente','annulee','remboursee'], default: 'en_attente' },
    modePaiement: { type: String, default: 'Mobile Money' },
    notes:        { type: String, default: '' },
    totalHT:      { type: Number, required: true, min: 0 },
    tva:          { type: Number, default: 0, min: 0 },
    totalTTC:     { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// Génération automatique du numéro de facture avant sauvegarde
InvoiceSchema.pre('save', async function (this: IInvoice, next) {
  if (!this.numero) {
    const count = await mongoose.model('Invoice').countDocuments();
    const year = new Date().getFullYear();
    this.numero = `FAC-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

InvoiceSchema.index({ statut: 1 });
InvoiceSchema.index({ createdAt: -1 });
InvoiceSchema.index({ email: 1 });

export default mongoose.model<IInvoice>('Invoice', InvoiceSchema);
