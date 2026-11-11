import { PaymentError } from '../services/paymentErrors.js';
import { Request, Response, NextFunction } from 'express';
import { singPayService } from '../services/singpay.service.js';
import { sendPaymentNotification } from '../services/whatsapp.service.js';
import { sendPushToUser } from '../services/push.service.js';
import Order from '../models/Order.model.js';
import type { TransactionProvider } from '../models/Transaction.model.js';
import { logger } from '../config/logger.js';
import { verifyQuote } from '../services/quote.service.js';
import {
  SingPayInitDto,
  SingPayInitResponse,
  SingPayCheckResponse,
  CashConfirmDto,
  CashConfirmResponse,
  ApiResponse,
} from '../types/payment.types.js';

// ── POST /api/payments/singpay/init ───────────────────────────────────────────
export const initPayment = async (
  req: Request<Record<string, string>, unknown, SingPayInitDto>,
  res: Response<ApiResponse<SingPayInitResponse>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId, method, phone, provider, customerName, customerEmail, description } = req.body;

    if (!orderId) {
      res.status(400).json({ success: false, error: "L'identifiant de commande est requis." });
      return;
    }
    // Le montant vient du devis signé par le serveur, pas du navigateur : on ne peut pas payer moins que le panier.
    const quoted = verifyQuote((req.body as { quote?: unknown }).quote);
    if (!quoted || quoted.orderId !== orderId) {
      res.status(400).json({ success: false, error: 'Votre panier doit être revalidé. Actualisez la page puis réessayez.' });
      return;
    }
    const amount = quoted.total;
    if (amount <= 0) {
      res.status(400).json({ success: false, error: 'Le montant doit être supérieur à 0 FCFA.' });
      return;
    }
    if (!method || !['mobile_money', 'card'].includes(method)) {
      res.status(400).json({ success: false, error: 'Méthode invalide. Valeurs acceptées : mobile_money, card.' });
      return;
    }
    if (method === 'mobile_money') {
      if (!phone) {
        res.status(400).json({ success: false, error: 'Le numéro de téléphone est requis pour Mobile Money.' });
        return;
      }
      if (!provider || !['airtel', 'moov'].includes(provider)) {
        res.status(400).json({ success: false, error: 'Le fournisseur doit être "airtel" ou "moov".' });
        return;
      }
    }
    if (method === 'card' && (!customerName || !customerEmail)) {
      res.status(400).json({ success: false, error: "Le nom et l'email du client sont requis pour le paiement par carte." });
      return;
    }

    // Anti-double paiement (non-bloquant) : refuse une commande déjà payée ou un double clic, pas un nouvel essai.
    const attempt = method === 'card' ? 'card' : provider;
    try {
      const doubleCheck = await singPayService.checkDoublePayment(orderId, attempt);
      if (doubleCheck.blocked) {
        res.status(409).json({
          success: false,
          error: doubleCheck.reason,
        });
        return;
      }
      // Annulation, délai dépassé, autre moyen de paiement : les essais précédents encore « en cours » ne bloquent plus.
      const replaced = await singPayService.supersedePending(orderId);
      if (replaced > 0) logger.info('[SingPay] Essais précédents remplacés', { orderId, replaced });
    } catch (dbError) {
      logger.warn('[Anti-double] Vérification DB échouée, paiement autorisé', { error: (dbError as Error).message });
    }

    let data: SingPayInitResponse;
    try {
      data = await singPayService.initTransaction({
        amount, orderId, method, phone, provider, customerName, customerEmail, description,
      });
    } catch (singpayError) {
      // Panne ou refus de l'opérateur : message prévu pour le client, code HTTP qui dit la vérité (503 = réessayer plus tard).
      if (singpayError instanceof PaymentError) {
        logger.error('[SingPay] Paiement non initié', { kind: singpayError.kind, detail: singpayError.detail });
        res.status(singpayError.httpStatus).json({ success: false, error: singpayError.message, code: singpayError.code });
        return;
      }
      // Validation interne (numéro absent…) : message déjà rédigé pour le client. Le reste ne sort jamais tel quel.
      logger.error('[SingPay] Erreur initTransaction', { message: singpayError instanceof Error ? singpayError.message : String(singpayError) });
      res.status(500).json({ success: false, error: "Le paiement n'a pas pu être lancé. Réessayez dans quelques instants." });
      return;
    }

    // Persistance MongoDB (sans attendre la fin)
    const resolvedProvider: TransactionProvider =
      method === 'mobile_money' ? ((provider as TransactionProvider) ?? 'airtel') : 'card';

    singPayService.saveTransaction({
      transactionId: data.transactionId || `TXN-${orderId}-${Date.now()}`,
      orderId,
      provider: resolvedProvider,
      amount,
      customerName,
      customerEmail,
      customerPhone: phone,
      paymentUrl: data.paymentUrl,
      expiresAt: data.expiresAt,
      ipAddress: req.ip,
      metadata: { method, provider, description },
    }).catch((err) => {
      logger.error('[Transaction] Sauvegarde échouée (non-critique)', { error: (err as Error).message });
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/payments/singpay/card ──────────────────────────────────────────
export const initCardPayment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { orderId, successUrl, cancelUrl, quote } = req.body as {
      orderId: string; successUrl?: string; cancelUrl?: string; quote?: unknown;
    };

    if (!orderId) {
      res.status(400).json({ success: false, error: 'Identifiant de commande requis.' });
      return;
    }
    // Même règle que le paiement mobile : montant issu du devis signé, jamais du navigateur.
    const quoted = verifyQuote(quote);
    if (!quoted || quoted.orderId !== orderId || quoted.total <= 0) {
      res.status(400).json({ success: false, error: 'Votre panier doit être revalidé. Actualisez la page puis réessayez.' });
      return;
    }
    const amount = quoted.total;

    // Même règle que pour le mobile : une commande déjà payée est refusée, les essais abandonnés sont remplacés.
    try {
      const doubleCheck = await singPayService.checkDoublePayment(orderId, 'card');
      if (doubleCheck.blocked) { res.status(409).json({ success: false, error: doubleCheck.reason }); return; }
      await singPayService.supersedePending(orderId);
    } catch (dbError) {
      logger.warn('[Anti-double] Vérification DB échouée, paiement autorisé', { error: (dbError as Error).message });
    }

    const result = await singPayService.initiateCardPayment({
      amount, orderId,
      customerName: '', customerEmail: '',
      successUrl, cancelUrl,
    });

    // Enregistrement en base (non-bloquant)
    singPayService.saveTransaction({
      transactionId: result.reference,
      orderId,
      provider: 'card',
      amount,
      paymentUrl: result.link,
      expiresAt: result.exp,
      ipAddress: req.ip,
      metadata: { method: 'card' },
    }).catch(err => logger.error('[Card] Sauvegarde transaction', { error: (err as Error).message }));

    res.json({ success: true, data: { link: result.link, exp: result.exp, reference: result.reference } });
  } catch (error) {
    if (error instanceof PaymentError) {
      logger.error('[SingPay Card]', { kind: error.kind, detail: error.detail });
      res.status(error.httpStatus).json({ success: false, error: error.message, code: error.code });
      return;
    }
    logger.error('[SingPay Card]', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: "Le paiement par carte n'a pas pu être lancé. Réessayez dans quelques instants." });
  }
};

// ── GET /api/payments/singpay/check/:transactionId ────────────────────────────
export const checkPayment = async (
  req: Request<{ transactionId: string }>,
  res: Response<ApiResponse<SingPayCheckResponse>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { transactionId } = req.params;
    if (!transactionId) {
      res.status(400).json({ success: false, error: "L'identifiant de transaction est requis." });
      return;
    }

    let data: SingPayCheckResponse;
    try {
      data = await singPayService.checkTransaction(transactionId);
    } catch (singpayError) {
      const message = singpayError instanceof Error ? singpayError.message : 'Erreur de vérification.';
      logger.error('[SingPay] Erreur checkTransaction', { message });
      res.status(singpayError instanceof PaymentError ? singpayError.httpStatus : 400).json({ success: false, error: message });
      return;
    }

    // Mise à jour du statut en base + notifications (sans attendre la fin)
    if (data.isComplete) {
      singPayService.updateTransactionStatus(transactionId, data.status, {
        paidAt: data.status === 'success' ? new Date() : undefined,
      }).catch((err) => {
        logger.error('[Transaction] Mise à jour statut échouée', { error: (err as Error).message });
      });

      if (data.status === 'success') {
        // Récupérer les infos de la transaction pour les notifications
        singPayService.getTransaction(transactionId).then(async (txn) => {
          if (!txn) return;

          // WhatsApp — confirmation de paiement
          sendPaymentNotification(
            txn.customerPhone ?? '',
            txn.customerName  ?? 'Client',
            txn.orderId,
            txn.amount,
            txn.provider,
          ).catch(e => logger.error('[WhatsApp] payment notification failed', { error: (e as Error).message }));

          // Push — chercher l'order pour avoir le userId
          const order = await Order.findById(txn.orderId).select('userId').lean().catch(() => null);
          if (order?.userId) {
            sendPushToUser(String(order.userId), {
              title: 'Paiement confirme',
              body:  `Votre paiement de ${txn.amount.toLocaleString('fr-FR')} FCFA a bien été reçu.`,
              url:   '/commandes',
            }).catch(e => logger.error('[Push] payment notification failed', { error: (e as Error).message }));
          }
        }).catch(e => logger.error('[Notification] transaction lookup failed', { error: (e as Error).message }));
      }
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/payments/singpay/cash ───────────────────────────────────────────
export const confirmCashPayment = async (
  req: Request<Record<string, string>, unknown, CashConfirmDto>,
  res: Response<ApiResponse<CashConfirmResponse>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId, fullName, phone, address, amount } = req.body;

    if (!orderId || !fullName || !phone || !address || !amount) {
      res.status(400).json({ success: false, error: 'Tous les champs sont requis.' });
      return;
    }

    const existingOrder = await Order.findById(orderId).select('_id').lean().catch(() => null);
    if (!existingOrder) {
      res.status(404).json({ success: false, error: 'Commande introuvable.' });
      return;
    }

    const transactionId = `CASH-${orderId}-${Date.now()}`;
    logger.info('[Cash] Paiement espèces', { orderId, fullName, amount, address });

    singPayService.saveTransaction({
      transactionId,
      orderId,
      provider: 'cash',
      amount,
      customerName: fullName,
      customerPhone: phone,
      ipAddress: req.ip,
      metadata: { address },
    }).then(() =>
      singPayService.updateTransactionStatus(transactionId, 'success')
    ).catch((err) => {
      logger.error('[Transaction] Espèces — sauvegarde échouée', { error: (err as Error).message });
    });

    res.status(200).json({
      success: true,
      data: {
        orderId,
        fullName,
        amount,
        message: `Commande ${orderId} enregistrée. Notre équipe vous contactera au ${phone} pour confirmer la livraison.`,
      },
    });
  } catch (error) {
    next(error);
  }
};
