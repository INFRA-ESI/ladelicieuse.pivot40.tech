import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, CheckCircle, Banknote, AlertCircle } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { formatFCFA } from '../../lib/utils';

interface CashPaymentCheckoutProps {
  amount: number;
  orderId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const CashPaymentCheckout: React.FC<CashPaymentCheckoutProps> = ({
  amount,
  orderId,
  onSuccess,
  onError,
}) => {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value.replace(/[^\d\s+]/g, ''));
    setError(null);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !phoneNumber || !address) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/singpay/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, fullName, phone: phoneNumber, address, amount }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        const msg = json.error || json.message || 'Erreur lors de l\'enregistrement';
        setError(msg);
        onError?.(msg);
        return;
      }

      setConfirmMessage(json.data?.message ?? 'Commande enregistrée avec succès.');
      setPaymentSuccess(true);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      setError(message);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (paymentSuccess) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Commande confirmée
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-2">{confirmMessage}</p>
          <p className="text-sm text-gray-500">Montant à régler : <strong>{formatFCFA(amount)}</strong></p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="w-5 h-5" />
          Paiement à la livraison
        </CardTitle>
        <CardDescription>
          Payez en espèces (FCFA) lors de la livraison — Montant : {formatFCFA(amount)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePayment} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="text-sm text-amber-800">
              Vous paierez en espèces (FCFA) lors de la réception de votre commande.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Votre prénom et nom"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numéro de téléphone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+241 XX XXX XXXX ou 0X XXX XXXX"
              value={phoneNumber}
              onChange={handlePhoneChange}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse de livraison</Label>
            <textarea
              id="address"
              placeholder="Rue, numéro, quartier, ville…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isLoading}
              className="w-full border border-border rounded-md p-2 text-sm"
              rows={3}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading || !fullName || !phoneNumber || !address}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            ) : (
              `Confirmer la commande — ${formatFCFA(amount)}`
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Nous vous appellerons pour confirmer les détails de livraison
          </p>
        </form>
      </CardContent>
    </Card>
  );
};
