import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, AlertCircle, CheckCircle, Smartphone } from '@/components/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatFCFA, validateGabonPhoneNumber, normalizeGabonPhoneNumber } from '../../lib/utils';

interface MobileMoneyCheckoutProps {
  amount: number;
  orderId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const MobileMoneyCheckout: React.FC<MobileMoneyCheckoutProps> = ({
  amount,
  orderId,
  onSuccess,
  onError,
}) => {
  const [provider, setProvider] = useState<'airtel' | 'moov' | ''>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value.replace(/[^\d\s+]/g, ''));
    setError(null);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!provider) {
      setError('Veuillez sélectionner un fournisseur');
      return;
    }
    if (!phoneNumber) {
      setError('Veuillez entrer un numéro de téléphone');
      return;
    }
    if (!validateGabonPhoneNumber(phoneNumber)) {
      const hint = provider === 'airtel'
        ? 'Airtel : 074, 076 ou 077 XXXXXX'
        : provider === 'moov'
        ? 'Moov : 062 ou 066 XXXXXX'
        : '074/076/077 (Airtel) ou 062/066 (Moov) suivi de 6 chiffres';
      setError(`Numéro invalide. ${hint}`);
      return;
    }

    setIsLoading(true);

    try {
      const normalizedPhone = normalizeGabonPhoneNumber(phoneNumber);

      let response: Response;
      try {
        response = await fetch('/api/payments/singpay/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            orderId,
            method: 'mobile_money',
            phone: normalizedPhone,
            provider,
            description: `Commande La Délicieuse Diète #${orderId}`,
          }),
        });
      } catch {
        const msg = 'Le serveur de paiement est inaccessible. Vérifiez votre connexion ou réessayez dans quelques instants.';
        setError(msg);
        onError?.(msg);
        return;
      }

      // Parse JSON — le body peut être vide ou HTML si le serveur crash
      let json: { success?: boolean; error?: string; message?: string; data?: { message?: string } } = {};
      try {
        json = await response.json();
      } catch {
        const msg = response.ok
          ? 'Réponse inattendue du serveur. Réessayez.'
          : `Erreur serveur (${response.status}). Vérifiez que le backend est démarré sur le port 3000.`;
        setError(msg);
        onError?.(msg);
        return;
      }

      if (!response.ok || !json.success) {
        const msg = json.error || json.message || 'Erreur lors du paiement';
        setError(msg);
        onError?.(msg);
        return;
      }

      setSuccessMessage(json.data?.message ?? 'Demande envoyée. Composez votre PIN pour valider.');
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
            Demande envoyée
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">{successMessage}</p>
          <p className="text-sm text-gray-500">
            Montant : <strong>{formatFCFA(amount)}</strong>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Mobile Money
        </CardTitle>
        <CardDescription>
          Airtel Money ou Moov Money — Montant : {formatFCFA(amount)}
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

          <div className="space-y-2">
            <Label htmlFor="provider">Fournisseur</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as 'airtel' | 'moov')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez votre fournisseur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="airtel">Airtel Money</SelectItem>
                <SelectItem value="moov">Moov Money</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numéro de téléphone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="074/076/077 XX XX XX (Airtel) ou 062/066 XX XX XX (Moov)"
              value={phoneNumber}
              onChange={handlePhoneChange}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500">
              Airtel : 074, 076, 077 XXXXXX · Moov : 062, 066 XXXXXX
            </p>
          </div>

          {provider && (
            <div className="bg-primary/10 border border-primary/20 rounded-md p-4">
              <p className="text-sm text-primary">
                Vous recevrez une demande de confirmation sur votre téléphone{' '}
                {provider === 'airtel' ? 'Airtel Money' : 'Moov Money'}.
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !provider || !phoneNumber}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              `Envoyer la demande de paiement — ${formatFCFA(amount)}`
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Votre numéro de téléphone est sécurisé et chiffré
          </p>
        </form>
      </CardContent>
    </Card>
  );
};
