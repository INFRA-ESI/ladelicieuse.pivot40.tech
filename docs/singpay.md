# La Délicieuse - SingPay Integration Guide

Complete setup guide for running La Délicieuse with full SingPay payment integration.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ et npm
- Un compte SingPay (https://singpay.ga)
- Deux terminaux (un pour le frontend, un pour le backend)

### 1. Configuration Frontend

```bash
# À la racine du projet
cp .env.example .env.local
```

Remplissez `.env.local`:
```env
VITE_SINGPAY_API_KEY=your_api_key_from_singpay
VITE_SINGPAY_MERCHANT_ID=your_merchant_id_from_singpay
VITE_API_URL=http://localhost:3000
VITE_PAYMENT_TIMEOUT=30000
```

### 2. Configuration Backend

```bash
# Dans le dossier backend/
cd backend
cp .env.example .env.local
npm install
```

Remplissez `backend/.env.local`:
```env
PORT=3000
FRONTEND_URL=http://localhost:5100
SINGPAY_API_KEY=your_api_key_from_singpay
SINGPAY_MERCHANT_ID=your_merchant_id_from_singpay
NODE_ENV=development
```

### 3. Lancer le Serveur Backend

Dans le terminal 1:
```bash
cd backend
npm run dev
```

Vous devriez voir:
```
✅ Serveur lancé sur http://localhost:3000
🔌 CORS activé pour http://localhost:5100
```

### 4. Lancer le Frontend

Dans le terminal 2:
```bash
npm install  # Si nécessaire
npm run dev
```

Accédez à `http://localhost:5100`

## 📋 Architecture

```
┌─────────────────────────────────────────┐
│         La Délicieuse Frontend          │
│     React 18 + TypeScript + Vite        │
│       (localhost:5100)                  │
└────────────────┬────────────────────────┘
                 │ /api/singpay/*
                 │ (Proxy via vite.config.ts)
                 ▼
┌─────────────────────────────────────────┐
│      La Délicieuse Backend              │
│     Express.js + Node.js + TypeScript   │
│       (localhost:3000)                  │
└────────────────┬────────────────────────┘
                 │ HTTPS
                 │ Authorization: Bearer TOKEN
                 ▼
┌─────────────────────────────────────────┐
│          SingPay API                    │
│   gateway.singpay.ga/v1                 │
└─────────────────────────────────────────┘
```

## 💳 Payment Methods Implementation

### 1. Card Payment (Visa/MasterCard)
- Component: `src/components/payment/CardPaymentCheckout.tsx`
- Backend: `POST /api/singpay/card-payment`
- SingPay Endpoint: `POST /ext`
- Flow: Frontend → Backend → SingPay External Interface → Customer Redirect

### 2. Airtel Money
- Component: `src/components/payment/MobileMoneyCheckout.tsx`
- Backend: `POST /api/singpay/airtel-payment`
- SingPay Endpoint: `POST /74/paiement`
- Flow: USSD Push → Customer Confirmation → Payment Completion

### 3. Moov Money
- Component: `src/components/payment/MobileMoneyCheckout.tsx`
- Backend: `POST /api/singpay/moov-payment`
- SingPay Endpoint: `POST /62/paiement`
- Flow: USSD Push → Customer Confirmation → Payment Completion

### 4. Cash on Delivery (Espèces)
- Component: `src/components/payment/CashPaymentCheckout.tsx`
- Backend: `POST /api/singpay/cash-payment`
- Flow: Order Creation → Confirmation Call → Payment at Delivery

## 📱 Phone Number Format

**Gabon Format:** +241 XXXXXXXXX (9 digits after country code)

Formats acceptés (tous normalisés en +241XXXXXXXXX):
- `+241 06 123 4567` ✅
- `0061234567` ✅
- `061234567` ✅
- `6123456` ❌ (trop court)

Validation implémentée:
- Frontend: `validateGabonPhoneNumber()`, `normalizeGabonPhoneNumber()`
- Backend: Validation avant appel SingPay

## 💰 Currency Format

**Currency:** XAF (West African CFA franc)
**Symbol:** FCFA or Fr
**Locale:** fr-FR (French - France)

Exemples:
- `50000` → `50 000 FCFA`
- `100000` → `100 000 FCFA`

Fonction formatter: `src/services/singpayService.ts::formatFCFA()`

## 🔐 Environment Variables

### Frontend (.env.local)
```env
# API Keys
VITE_SINGPAY_API_KEY=pk_live_xxx  # Pour test uniquement, ne pas utiliser en production
VITE_SINGPAY_MERCHANT_ID=mid_xxx

# API Configuration
VITE_API_URL=http://localhost:3000
VITE_PAYMENT_TIMEOUT=30000
```

### Backend (.env.local)
```env
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5100

# SingPay Credentials (SECURE!)
SINGPAY_API_KEY=your_api_key
SINGPAY_MERCHANT_ID=your_merchant_id
```

## 📂 Project Structure

```
ladelicieuse.pivot40.tech-main/
├── src/
│   ├── services/
│   │   └── singpayService.ts          # SingPay API client (frontend)
│   ├── components/
│   │   ├── payment/
│   │   │   ├── CardPaymentCheckout.tsx
│   │   │   ├── MobileMoneyCheckout.tsx
│   │   │   ├── CashPaymentCheckout.tsx
│   │   │   └── PaymentMethods.tsx
│   │   └── ...
│   ├── pages/
│   │   └── CartPage.tsx               # Integrated with PaymentMethods
│   └── ...
├── backend/
│   ├── server.ts                      # Express server
│   ├── routes/
│   │   └── singpay.routes.ts          # API endpoints
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── .env.local (create me)
│   └── README.md
├── .env.example                       # Frontend env template
├── .env.local (create me)            # Frontend env (create from template)
├── vite.config.ts                     # Includes /api proxy
├── package.json
└── ...
```

## 🧪 Testing Payment Flow

### Test 1: Card Payment
1. Open `http://localhost:5100`
2. Add items to cart
3. Click "Finaliser la commande" (Checkout)
4. Select "Carte" tab
5. Enter test card details
6. Click "Payer avec Carte"
7. Should redirect to SingPay payment page

### Test 2: Airtel Money
1. Follow steps 1-4 above
2. Select "Mobile Money" tab
3. Select "Airtel Money"
4. Enter Gabon phone number (e.g., +241061234567)
5. Click "Payer avec Airtel Money"
6. Should show USSD confirmation message
7. Check your phone for USSD request

### Test 3: Moov Money
1. Follow steps 1-4 above
2. Select "Mobile Money" tab
3. Select "Moov Money"
4. Enter Gabon phone number
5. Click "Payer avec Moov Money"
6. Should show USSD confirmation message

### Test 4: Cash on Delivery
1. Follow steps 1-4 above
2. Select "Espèces" tab
3. Fill in delivery details
4. Click "Commander en Espèces"
5. Should show confirmation message
6. Order created with status "pending"

## 🔧 Customization

### Change Port
Edit `backend/.env.local`:
```env
PORT=3000  # Change this
```

Update `vite.config.ts` proxy:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:YOUR_PORT',  // Change here too
  },
},
```

### Add New Payment Method
1. Create new component in `src/components/payment/`
2. Add new backend route in `backend/routes/singpay.routes.ts`
3. Export from `src/components/payment/index.ts`
4. Add new tab to `PaymentMethods.tsx`

## 🚨 Important Security Notes

1. **Never commit `.env.local`** - Add to `.gitignore`
2. **Keep API keys private** - They should only be in environment variables
3. **Use HTTPS in production** - This is critical for payment data
4. **Validate all inputs** - Both frontend and backend
5. **Implement webhook signature verification** - For SingPay callbacks
6. **Enable CORS properly** - Only allow your frontend domain

## 📞 Support & Documentation

### Official Resources
- **SingPay API Docs:** https://client.singpay.ga/doc/reference/index.html
- **React Docs:** https://react.dev
- **TypeScript Docs:** https://www.typescriptlang.org
- **Express Docs:** https://expressjs.com

### Internal Docs
- [Backend Setup Guide](backend/README.md)
- [Payment Integration Details](PAYMENT_INTEGRATION.md)
- [Technology Stack](TECH_STACK.md)

### Troubleshooting Checklist
- [ ] Both frontend (5100) and backend (3000) are running
- [ ] `.env.local` files are created and filled
- [ ] SingPay API key and merchant ID are correct
- [ ] CORS is enabled correctly
- [ ] Network requests are showing in browser DevTools
- [ ] Backend logs show incoming requests

## 🎯 Next Steps

1. **Get SingPay credentials** from https://singpay.ga
2. **Fill environment variables** in `.env.local` files
3. **Start both servers** (frontend and backend)
4. **Test payment flows** using test credentials
5. **Configure callbacks** in SingPay dashboard
6. **Deploy to production** when ready

---

**Version:** 1.0.0  
**Last Updated:** 2024  
**Language:** French (fr-FR) & FCFA Currency
