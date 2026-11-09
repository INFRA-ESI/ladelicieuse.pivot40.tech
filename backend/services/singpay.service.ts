import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { singpayConfig } from '../config/singpay.config.js';
import TransactionModel, { type TransactionProvider } from '../models/Transaction.model.js';
import { logger } from '../config/logger.js';
import {
  SingPayMobileMoneyRequest,
  SingPayPaymentResponse,
  SingPayWebhookPayload,
  InitiateMobileMoneyPaymentDto,
  InitiateCardPaymentDto,
  SingPayInitDto,
  SingPayInitResponse,
  SingPayCheckResponse,
  SingPayRawTransaction,
  SingPayRawResponse,
  PaymentStatus,
} from '../types/payment.types.js';

export const normalizeGabonPhone = (phone: string): string => {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+241')) {
    const digits = cleaned.slice(4);
    if (digits.length === 8) return `241${digits}`;
    if (digits.length === 9 && digits.startsWith('0')) return `241${digits.slice(1)}`;
  }
  if (cleaned.startsWith('241') && cleaned.length === 11) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 9) return `241${cleaned.slice(1)}`;
  if (cleaned.length === 8) return `241${cleaned}`;
  throw new Error(`Numéro de téléphone invalide : "${phone}". Format accepté : +24177XXXXXX ou 077XXXXXX`);
};

class SingPayService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: singpayConfig.apiBaseUrl,
      timeout: singpayConfig.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-client-id':     singpayConfig.clientId,
        'x-client-secret': singpayConfig.clientSecret,
        'x-wallet':        singpayConfig.walletId,
      },
    });

    this.client.interceptors.request.use((config) => {
      logger.info(`[SingPay →] ${config.method?.toUpperCase()} ${(config.baseURL ?? '') + (config.url ?? '')}`);
      return config;
    });
    this.client.interceptors.response.use(
      (res) => { logger.info(`[SingPay ←] ${res.status} ${res.config.url}`); return res; },
      (err) => {
        logger.error(`[SingPay ← ERR] ${err.response?.status} ${err.response?.config?.url}`);
        return Promise.reject(err);
      }
    );
  }

  private generateReference(orderId: string): string {
    const random = uuidv4().split('-')[0].toUpperCase();
    return `LD-${orderId}-${random}`;
  }

  // "241XXXXXXXX" → "0XXXXXXXX"  (format attendu par SingPay Airtel & Moov)
  private toLocalMsisdn(phone: string): string {
    const e164 = normalizeGabonPhone(phone);
    return '0' + e164.slice(3);
  }

  // ── Initiation Mobile Money ─────────────────────────────────────────────────

  async initiateMobileMoneyPayment(dto: InitiateMobileMoneyPaymentDto): Promise<SingPayPaymentResponse> {
    const client_msisdn = this.toLocalMsisdn(dto.phone);
    const reference = this.generateReference(dto.orderId);

    const payload: SingPayMobileMoneyRequest = {
      amount:       dto.amount,
      reference,
      client_msisdn,
      portefeuille: singpayConfig.walletId,
      disbursement: singpayConfig.disbursementId,
      isTransfer:   false,
    };

    // Airtel Money → /74/paiement, Moov Money → /62/paiement
    const endpoint = dto.provider === 'airtel'
      ? singpayConfig.endpoints.airtelMoneyPayment
      : singpayConfig.endpoints.moovMoneyPayment;

    try {
      const { data } = await this.client.post<SingPayRawResponse>(endpoint, payload);

      if (data?.status?.success === false) {
        throw new Error(
          `SingPay: ${data.status.message ?? 'Erreur inconnue'} (code: ${data.status.result_code ?? data.status.code})`
        );
      }

      // L'ID de polling est dans data.transaction.id (ex: "916dcb70-08b3"), pas _id
      const txnId = data?.transaction?.id ?? data?.transaction?._id;
      return { ...data, transaction_id: txnId } as unknown as SingPayPaymentResponse;
    } catch (error) {
      throw this.handleApiError(error, 'initiateMobileMoneyPayment');
    }
  }

  async initiateCardPayment(
    dto: InitiateCardPaymentDto & { successUrl?: string; cancelUrl?: string }
  ): Promise<{ link: string; exp: string; reference: string }> {
    const reference = this.generateReference(dto.orderId);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5100';

    const payload = {
      portefeuille:     singpayConfig.walletId,
      reference,
      redirect_success: dto.successUrl || `${frontendUrl}/paiement/succes?order=${dto.orderId}&provider=card`,
      redirect_error:   dto.cancelUrl  || `${frontendUrl}/paiement/echec?order=${dto.orderId}&provider=card`,
      amount:           dto.amount,
      disbursement:     singpayConfig.disbursementId,
      logoURL:          singpayConfig.logoUrl || `${frontendUrl}/logo.png`,
      isTransfer:       false,
    };

    try {
      const { data } = await this.client.post<{ link: string; exp: string }>(
        singpayConfig.endpoints.cardPayment,
        payload,
      );
      if (!data?.link) throw new Error('SingPay n\'a pas retourné de lien de paiement.');
      return { link: data.link, exp: data.exp, reference };
    } catch (error) {
      throw this.handleApiError(error, 'initiateCardPayment');
    }
  }

  // ── Point d'entrée unifié ───────────────────────────────────────────────────

  async initTransaction(dto: SingPayInitDto): Promise<SingPayInitResponse> {
    if (dto.method === 'mobile_money') {
      if (!dto.phone)    throw new Error('Le numéro de téléphone est requis pour Mobile Money.');
      if (!dto.provider) throw new Error('Le fournisseur est requis (airtel ou moov).');

      const resp = await this.initiateMobileMoneyPayment({
        amount:        dto.amount,
        provider:      dto.provider,
        phone:         dto.phone,
        orderId:       dto.orderId,
        description:   dto.description,
        customerName:  dto.customerName,
        customerEmail: dto.customerEmail,
      });

      return {
        transactionId: resp.transaction_id ?? '',
        status:        'pending' as PaymentStatus,
        orderId:       dto.orderId,
        amount:        dto.amount,
        method:        dto.method,
        expiresAt:     resp.expires_at,
        message: dto.provider === 'airtel'
          ? 'Demande envoyée sur votre Airtel Money. Composez votre PIN pour valider.'
          : 'Demande envoyée sur votre Moov Money. Composez votre PIN pour valider.',
      };
    }

    const resp = await this.initiateCardPayment({
      amount:        dto.amount,
      orderId:       dto.orderId,
      customerName:  dto.customerName ?? '',
      customerEmail: dto.customerEmail ?? '',
      description:   dto.description,
      successUrl:    dto.successUrl,
      cancelUrl:     dto.cancelUrl,
    });

    return {
      transactionId: resp.reference,
      status:        'pending' as PaymentStatus,
      orderId:       dto.orderId,
      amount:        dto.amount,
      method:        dto.method,
      paymentUrl:    resp.link,
      expiresAt:     resp.exp,
      message:       'Redirection vers SingPay pour le paiement sécurisé.',
    };
  }

  // ── Mapping statut SingPay brut → PaymentStatus interne ────────────────────
  // "Start"     → processing (en attente de validation PIN client)
  // "Terminate" → failed     (solde insuffisant, annulation, timeout opérateur)
  // "Refund"    → success    (paiement confirmé et reversé au portefeuille)
  private mapSingPayStatus(txn: SingPayRawTransaction): PaymentStatus {
    if (txn.status === 'Terminate') return 'failed';
    if (txn.status === 'Refund')    return txn.result === 'Success' ? 'success' : 'failed';
    return 'processing';
  }

  private buildCheckResponse(txn: SingPayRawTransaction, envelope: { message?: string }): SingPayCheckResponse {
    const status = this.mapSingPayStatus(txn);
    const messages: Record<PaymentStatus, string> = {
      pending:    'Paiement en attente de confirmation.',
      processing: 'Demande envoyée — en attente de validation PIN client.',
      success:    'Paiement confirmé avec succès.',
      failed:     envelope.message ?? 'Le paiement a échoué.',
      cancelled:  'Le paiement a été annulé.',
      timeout:    'La demande de paiement a expiré.',
    };
    return {
      transactionId: txn.id,
      orderId:       txn.reference,
      status,
      amount:        txn.amount,
      provider:      txn.type?.toLowerCase(),
      paidAt:        txn.refund_at ?? txn.terminate_at ?? undefined,
      message:       messages[status],
      isComplete:    ['success', 'failed', 'cancelled', 'timeout'].includes(status),
    };
  }

  // ── Check immédiat ──────────────────────────────────────────────────────────

  async checkTransaction(transactionId: string): Promise<SingPayCheckResponse> {
    try {
      const { data } = await this.client.get<SingPayRawResponse>(
        `${singpayConfig.endpoints.paymentStatus}/${transactionId}`
      );
      return this.buildCheckResponse(data.transaction, data.status);
    } catch (error) {
      throw this.handleApiError(error, 'checkTransaction');
    }
  }

  // ── Polling bloquant max 30 s ───────────────────────────────────────────────

  async pollTransactionStatus(transactionId: string, maxWaitMs = 30_000): Promise<SingPayCheckResponse> {
    const INTERVAL = 3_000;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      try {
        const { data } = await this.client.get<SingPayRawResponse>(
          `${singpayConfig.endpoints.paymentStatus}/${transactionId}`
        );
        const result = this.buildCheckResponse(data.transaction, data.status);
        if (result.isComplete) return result;
      } catch (error) {
        logger.warn('[SingPay poll] erreur transitoire', { error: (error as Error).message });
      }

      await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL));
    }

    return {
      transactionId,
      orderId:    '',
      status:     'timeout',
      amount:     0,
      message:    'Délai de confirmation dépassé (30 s). Vérifiez votre solde ou réessayez.',
      isComplete: true,
    };
  }

  // ── Lecture transaction en base ────────────────────────────────────────────

  async getTransaction(transactionId: string) {
    return TransactionModel.findOne({ transactionId }).lean();
  }

  // ── Mise à jour statut en base ──────────────────────────────────────────────

  async updateTransactionStatus(
    transactionId: string,
    status: PaymentStatus,
    extra?: { paidAt?: Date; errorMessage?: string }
  ): Promise<void> {
    await TransactionModel.updateOne(
      { transactionId },
      { $set: { status, ...(extra ?? {}) } }
    );
  }

  // ── Anti-double paiement ────────────────────────────────────────────────────

  async checkDoublePayment(orderId: string): Promise<{ blocked: boolean; reason?: string; transactionId?: string }> {
    const existing = await TransactionModel.findOne({
      orderId,
      status: { $in: ['pending', 'processing', 'success'] },
    }).sort({ createdAt: -1 });

    if (!existing) return { blocked: false };
    if (existing.status === 'success') {
      return { blocked: true, reason: 'Cette commande a déjà été payée.', transactionId: existing.transactionId };
    }
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs < 5 * 60 * 1000) {
      return { blocked: true, reason: 'Un paiement est déjà en cours pour cette commande.', transactionId: existing.transactionId };
    }
    return { blocked: false };
  }

  // ── Persistance MongoDB ─────────────────────────────────────────────────────

  async saveTransaction(params: {
    transactionId: string;
    orderId: string;
    provider: TransactionProvider;
    amount: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    paymentUrl?: string;
    expiresAt?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await TransactionModel.create({
      transactionId:  params.transactionId,
      idempotencyKey: `${params.orderId}-${params.provider}-${params.amount}`,
      orderId:        params.orderId,
      provider:       params.provider,
      amount:         params.amount,
      customerName:   params.customerName,
      customerEmail:  params.customerEmail,
      customerPhone:  params.customerPhone,
      paymentUrl:     params.paymentUrl,
      expiresAt:      params.expiresAt ? new Date(params.expiresAt) : undefined,
      ipAddress:      params.ipAddress,
      metadata:       params.metadata,
      status:         'pending',
    });
  }

  // ── Webhook ─────────────────────────────────────────────────────────────────

  verifyWebhookSignature(payload: SingPayWebhookPayload, rawBody: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', singpayConfig.clientSecret)
        .update(rawBody)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(payload.signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  private handleApiError(error: unknown, context: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as Record<string, unknown> | undefined;
      const message = (data?.message as string) || error.message;
      switch (status) {
        case 400: return new Error(`Requête invalide (${context}): ${message}`);
        case 401: return new Error('Authentification SingPay échouée. Vérifiez SINGPAY_API_KEY et SINGPAY_API_SECRET.');
        case 402: return new Error('Solde insuffisant sur le portefeuille SingPay.');
        case 404: return new Error(`Endpoint SingPay introuvable (${context}) — vérifiez SINGPAY_API_BASE_URL.`);
        case 429: return new Error('Limite de requêtes SingPay atteinte. Réessayez dans quelques secondes.');
        case 503: return new Error('Service SingPay temporairement indisponible.');
        default:  return new Error(`Erreur SingPay ${status} (${context}): ${message}`);
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

export const singPayService = new SingPayService();
