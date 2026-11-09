import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Send, CheckCircle2 } from '@/components/icons';
import { toast } from 'sonner';

interface Props {
  page: 'consultations' | 'abonnement' | 'accueil';
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="focus:outline-none"
        >
          <Star className={`w-7 h-7 transition-colors ${n <= (hover || value) ? 'fill-primary text-primary' : 'text-border'}`} />
        </button>
      ))}
    </div>
  );
}

export default function TestimonialSubmitForm({ page }: Props) {
  const [nom,     setNom]     = useState('');
  const [texte,   setTexte]   = useState('');
  const [note,    setNote]    = useState(5);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !texte.trim()) {
      toast.error('Merci de remplir votre nom et votre avis.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/testimonials/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nom: nom.trim(), texte: texte.trim(), note, page }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setSent(true);
      toast.success('Merci ! Votre avis sera publié après validation.');
    } catch {
      toast.error('Erreur lors de l\'envoi. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-8 text-center"
      >
        <CheckCircle2 className="w-10 h-10 text-primary" />
        <p className="font-display text-xl text-foreground">Merci pour votre témoignage</p>
        <p className="font-body text-sm text-muted-foreground">Il sera publié après validation par notre équipe.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-xs text-muted-foreground block mb-1.5">
            Votre nom *
          </label>
          <input
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Ex : Eric M."
            className="w-full h-11 px-4 bg-muted border border-border rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="font-body text-xs text-muted-foreground block mb-1.5">
            Note
          </label>
          <StarPicker value={note} onChange={setNote} />
        </div>
      </div>
      <div>
        <label className="font-body text-xs text-muted-foreground block mb-1.5">
          Votre avis *
        </label>
        <textarea
          value={texte}
          onChange={e => setTexte(e.target.value)}
          rows={4}
          placeholder="Partagez votre expérience…"
          className="w-full px-4 py-3 bg-muted border border-border rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={sending}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-body text-sm hover:bg-primary/90 active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform] disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        {sending ? 'Envoi en cours…' : 'Envoyer mon témoignage'}
      </button>
    </form>
  );
}
