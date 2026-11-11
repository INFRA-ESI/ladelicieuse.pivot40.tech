export type PaymentMethod = 'mobile_money' | 'card' | 'cash';

export type MobileMoneyProvider = 'airtel' | 'moov';
export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled' | 'timeout';

export interface InitiateMobileMoneyPaymentDto {
  amount: number;
  provider: MobileMoneyProvider;
  phone: string;
  orderId: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface InitiateCardPaymentDto {
  amount: number;
  orderId: string;
  customerName: string;
  customerEmail: string;
  description?: string;
}

export interface SingPayMobileMoneyRequest {
  amount:        number;
  reference:     string;
  client_msisdn: string;
  portefeuille:  string;
  disbursement:  string;
  isTransfer:    boolean;
}

export interface SingPayStatusEnvelope {
  code:        string | number;
  message:     string;
  success:     boolean;
  result_code: string | number;
}

export interface SingPayPaymentResponse {
  status:          SingPayStatusEnvelope;
  transaction_id?: string;
  reference?:      string;
  amount?:         number;
  message?:        string;
  payment_url?:    string;
  expires_at?:     string;
  success?:        boolean;
}

export interface SingPayWebhookPayload {
  event: 'payment.success' | 'payment.failed' | 'payment.cancelled' | 'payment.timeout';
  transaction_id: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  provider?: string;
  phone?: string;
  wallet_id: string;
  timestamp: string;
  signature: string;
  message?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  /** Code lisible par le site : PROVIDER_UNAVAILABLE (réessayer plus tard) ou PAYMENT_REJECTED. */
  code?: string;
}

export interface PaymentInitiatedResponse {
  transactionId: string;
  status: PaymentStatus;
  orderId: string;
  amount: number;
  message: string;
  paymentUrl?: string;
  expiresAt?: string;
}

export interface PaymentStatusResponse {
  transactionId: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  paidAt?: string;
  message: string;
}

export interface SingPayInitDto {
  amount: number;
  orderId: string;
  method: Extract<PaymentMethod, 'mobile_money' | 'card'>;
  phone?: string;
  provider?: MobileMoneyProvider;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CashConfirmDto {
  orderId: string;
  fullName: string;
  phone: string;
  address: string;
  amount: number;
}

export interface CashConfirmResponse {
  orderId: string;
  fullName: string;
  amount: number;
  message: string;
}

export interface SingPayInitResponse {
  transactionId: string;
  status: PaymentStatus;
  orderId: string;
  amount: number;
  method: string;
  paymentUrl?: string;
  expiresAt?: string;
  message: string;
}

export interface SingPayCheckResponse {
  transactionId: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  provider?: string;
  paidAt?: string;
  message: string;
  isComplete: boolean;
}

// ── SingPay raw API response ──────────────────────────────────────────────────

export interface SingPayRawTransaction {
  _id:      string;
  id:       string;        // ID de polling court, ex: "916dcb70-08b3"
  type:     string;        // "Airtel" | "Moov"
  status:   string;        // "Start" | "Terminate" | "Refund"
  result?:  string;        // "Success" | "BalanceError" | "UserCancel" …
  amount:   number;
  reference: string;
  client_msisdn: string;
  airtel_money_id?: string;
  partenaire_at?:  string;
  terminate_at?:   string;
  refund_at?:      string;
  canManualDisbursement: boolean;
}

export interface SingPayRawResponse {
  transaction: SingPayRawTransaction;
  status:      SingPayStatusEnvelope;
}
