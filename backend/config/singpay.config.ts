import dotenv from 'dotenv';
import { logger } from './logger.js';
dotenv.config();

export const singpayConfig = {
  apiBaseUrl:     process.env.SINGPAY_API_BASE_URL   || 'https://gateway.singpay.ga/v1',
  clientId:       process.env.SINGPAY_API_KEY        || '',
  clientSecret:   process.env.SINGPAY_API_SECRET     || '',
  walletId:       process.env.SINGPAY_WALLET_ID      || '',
  disbursementId: process.env.SINGPAY_DISBURSEMENT_ID || '',
  logoUrl:        process.env.SINGPAY_LOGO_URL       || '',
  extBaseUrl:     process.env.SINGPAY_EXT_BASE_URL   || 'https://gateway.singpay.ga',
  endpoints: {
    airtelMoneyPayment: '/74/paiement',
    moovMoneyPayment:   '/62/paiement',
    cardPayment:        process.env.SINGPAY_CARD_ENDPOINT || '/ext/',
    paymentStatus:      '/transaction/api/status',
  },
  requestTimeout: 30000,
} as const;

export const validateConfig = (): void => {
  const required = [
    'SINGPAY_API_KEY',
    'SINGPAY_API_SECRET',
    'SINGPAY_WALLET_ID',
    'SINGPAY_DISBURSEMENT_ID',
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.warn(`Variables SingPay manquantes : ${missing.join(', ')} — paiements désactivés`);
  }
};
