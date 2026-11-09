import { Router } from 'express';
import { z } from 'zod';
import { initPayment, initCardPayment, checkPayment, confirmCashPayment } from '../controllers/singpay.controller.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const InitPaymentSchema = z.object({
  orderId:       z.string().min(1).max(128),
  quote:         z.string().min(20).max(8000),
  amount:        z.number().positive().optional(), // ignoré : le montant vient du devis
  method:        z.enum(['mobile_money', 'card']),
  phone:         z.string().regex(/^\+?[\d\s()-]{7,20}$/, 'Numéro de téléphone invalide').optional(),
  provider:      z.enum(['airtel', 'moov', 'card']).optional(),
  customerName:  z.string().min(1).max(100).optional(),
  customerEmail: z.string().email().max(254).optional(),
  description:   z.string().max(255).optional(),
});

const CardPaymentSchema = z.object({
  orderId:    z.string().min(1).max(128),
  quote:      z.string().min(20).max(8000),
  amount:     z.number().positive().optional(), // ignoré : le montant vient du devis
  successUrl: z.string().url().optional(),
  cancelUrl:  z.string().url().optional(),
});

const CashPaymentSchema = z.object({
  orderId:  z.string().min(1).max(128),
  fullName: z.string().min(1).max(100),
  phone:    z.string().regex(/^\+?[\d\s()-]{7,20}$/, 'Numéro de téléphone invalide'),
  address:  z.string().min(1).max(300),
  amount:   z.number().positive('Le montant doit être positif'),
});

// 10 initiations max / 10 min / IP — largement suffisant pour un vrai client
router.post('/singpay/init', rateLimiter(10, 600, 'payment-init'), validate(InitPaymentSchema), initPayment);
router.post('/singpay/card', rateLimiter(10, 600, 'payment-card'), validate(CardPaymentSchema), initCardPayment);
// 60 polls / 10 min / IP — compatible avec un poll toutes les 10s pendant 10 min
router.get('/singpay/check/:transactionId', rateLimiter(60, 600, 'payment-check'), checkPayment);
// 5 confirmations espèces / 10 min / IP
router.post('/singpay/cash', rateLimiter(5, 600, 'payment-cash'), validate(CashPaymentSchema), confirmCashPayment);

export default router;
