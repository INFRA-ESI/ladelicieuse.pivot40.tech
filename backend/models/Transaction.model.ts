import mongoose, { Schema, Document } from 'mongoose';
import type { PaymentStatus } from '../types/payment.types.js';

export type TransactionProvider = 'airtel' | 'moov' | 'paypal' | 'card' | 'cash';

export interface ITransaction extends Document {
  transactionId: string;
  idempotencyKey: string;
  orderId: string;
  provider: TransactionProvider;
  status: PaymentStatus;
  amount: number;
  currency: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentUrl?: string;
  expiresAt?: Date;
  paidAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    transactionId:  { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, index: true },
    orderId:        { type: String, required: true, index: true },
    provider:       { type: String, enum: ['airtel', 'moov', 'paypal', 'card', 'cash'], required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'cancelled', 'timeout'],
      default: 'pending',
    },
    amount:        { type: Number, required: true, min: 0 },
    currency:      { type: String, default: 'XAF' },
    customerName:  String,
    customerEmail: String,
    customerPhone: String,
    paymentUrl:    String,
    expiresAt:     Date,
    paidAt:        Date,
    errorMessage:  String,
    metadata:      { type: Schema.Types.Mixed },
    ipAddress:     String,
  },
  { timestamps: true }
);

// Index composés pour les requêtes anti-double paiement
TransactionSchema.index({ orderId: 1, status: 1 });
TransactionSchema.index({ createdAt: -1 });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
