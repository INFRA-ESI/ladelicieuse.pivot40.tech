import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cachedJson } from '@/services/publicApiService';
import { useUser } from '@/context/UserContext';
import { Phone, Mail, MapPin, Clock, Instagram, Facebook } from '@/components/icons';
import logo from '@/assets/logo.webp';

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

function toDisplay(time: string) {
  return time.replace(':', 'h');
}

// Un client connecté navigue dans l'espace à barre latérale (AppNav), qui n'a pas de pied de page.
export default function Footer() {
  const { user } = useUser();
  const [info, setInfo] = useState<PublicSettings>(FALLBACK);

  useEffect(() => {
    if (user) return;
    cachedJson('/api/settings/public')
      .then(json => {
        if (json.success && json.data) {
          setInfo(prev => ({ ...prev, ...json.data }));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[Footer] /api/settings :', err); });
  }, [user]);

  if (user) return null;

  const telHref    = `tel:${info.tel.replace(/\s/g, '')}`;
  const emailHref  = info.email ? `mailto:${info.email}` : '#';
  const heures     = `${toDisplay(info.ouverture)} – ${toDisplay(info.fermeture)}`;

  return (
    <footer className="bg-foreground text-primary-foreground">
      {/* Main footer */}
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-8 md:py-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6 md:gap-x-8 md:gap-y-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <img src={logo} alt={info.nom} className="h-10 w-auto" />
              <span className="font-display text-xl text-primary-foreground">{info.nom}</span>
            </div>
            <p className="font-body text-sm text-primary-foreground/60 leading-relaxed mb-4">
              Votre destination pour une alimentation saine, savoureuse et personnalisée à Libreville.
            </p>
            <div className="flex gap-3">
              <a href="https://www.instagram.com/ladelicieuse.1/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/10 transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://www.facebook.com/La.delicieuse.Salade/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/10 transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-display text-base mb-3">Navigation</h4>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 md:block md:space-y-2">
              {[
                { to: '/', label: 'Accueil' },
                { to: '/composer', label: 'Commander' },
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
          <div className="col-span-2 order-3 md:col-span-1 md:order-none">
            <h4 className="font-display text-base mb-3">Contact</h4>
            <ul className="space-y-2.5">
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
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-display text-base mb-3">Horaires</h4>
            <ul className="space-y-2">
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
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-4 flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
          <p className="font-body text-xs text-primary-foreground/40">
            © {new Date().getFullYear()} {info.nom} · Libreville, Gabon · Tous droits réservés
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
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
