import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Instagram, Facebook } from 'lucide-react';
import logo from '@/assets/logo.png';

interface PublicSettings {
  nom: string;
  tel: string;
  adresse: string;
  email?: string;
  ouverture: string;
  fermeture: string;
}

const FALLBACK: PublicSettings = {
  nom:       'La Délicieuse Diète',
  tel:       '+241 76 35 90 20',
  adresse:   'Quartier Louis, Libreville, Gabon',
  email:     'ladelicieuse.1@gmail.com',
  ouverture: '08:00',
  fermeture: '21:00',
};

function toWaMe(tel: string) {
  return tel.replace(/[\s+]/g, '');
}

function toDisplay(time: string) {
  return time.replace(':', 'h');
}

export default function Footer() {
  const [info, setInfo] = useState<PublicSettings>(FALLBACK);

  useEffect(() => {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), 8000);

    fetch('/api/settings/public', { signal: ac.signal })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setInfo(prev => ({ ...prev, ...json.data }));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[Footer] /api/settings :', err); });

    return () => { clearTimeout(tid); ac.abort(); };
  }, []);

  const telHref    = `tel:${info.tel.replace(/\s/g, '')}`;
  const waHref     = `https://wa.me/${toWaMe(info.tel)}`;
  const emailHref  = info.email ? `mailto:${info.email}` : '#';
  const heures     = `${toDisplay(info.ouverture)} – ${toDisplay(info.fermeture)}`;

  return (
    <footer className="bg-foreground text-primary-foreground">
      {/* Main footer */}
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <img src={logo} alt={info.nom} className="h-12 w-auto" />
              <span className="font-display text-2xl text-primary-foreground">{info.nom}</span>
            </div>
            <p className="font-body text-sm text-primary-foreground/60 leading-relaxed mb-6">
              Votre destination pour une alimentation saine, savoureuse et personnalisée à Libreville.
            </p>
            <div className="flex gap-4">
              <a href="https://www.instagram.com/ladelicieuse.1/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/10 transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://www.facebook.com/La.delicieuse.Salade/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/10 transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-display text-lg mb-4">Navigation</h4>
            <ul className="space-y-3">
              {[
                { to: '/', label: 'Accueil' },
                { to: '/composer', label: 'Commander ma salade' },
                { to: '/jus', label: 'Jus & Détox' },
                { to: '/repas', label: 'Repas équilibrés' },
                { to: '/abonnement', label: 'Abonnement' },
                { to: '/dieteticien', label: 'Diététicien' },
                { to: '/panier', label: 'Mon panier' },
              ].map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="font-body text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-lg mb-4">Contact</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <span className="font-body text-sm text-primary-foreground/60">
                  {info.adresse}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <a href={telHref} className="font-body text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                  {info.tel}
                </a>
              </li>
              {info.email && (
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-primary shrink-0" />
                  <a href={emailHref} className="font-body text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    {info.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Horaires */}
          <div>
            <h4 className="font-display text-lg mb-4">Horaires</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <div className="font-body text-sm text-primary-foreground/60">
                  <p>Lundi – Dimanche</p>
                  <p className="text-primary-foreground/80">{heures}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-primary-foreground/10">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body text-xs text-primary-foreground/40">
            © {new Date().getFullYear()} {info.nom} · Libreville, Gabon · Tous droits réservés
          </p>
          <div className="flex gap-6">
            <Link to="/mentions-legales" className="font-body text-xs text-primary-foreground/40 hover:text-primary-foreground/60 transition-colors">
              Mentions légales
            </Link>
            <Link to="/politique-confidentialite" className="font-body text-xs text-primary-foreground/40 hover:text-primary-foreground/60 transition-colors">
              Politique de confidentialité
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
