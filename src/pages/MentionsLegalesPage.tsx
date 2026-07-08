import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/Footer';

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen pt-24 pb-20 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
        </Link>

        <h1 className="font-display text-4xl text-foreground mb-2">Mentions légales</h1>
        <p className="font-body text-sm text-muted-foreground mb-10">Dernière mise à jour : juin 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 font-body text-foreground/80">
          <section>
            <h2 className="font-display text-xl text-foreground mb-3">1. Éditeur du site</h2>
            <p>Le site <strong>ladelicieuse.pivot40.tech</strong> est édité par :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Raison sociale :</strong> La Délicieuse Diète</li>
              <li><strong>Adresse :</strong> Quartier Louis, Libreville, Gabon</li>
              <li><strong>Téléphone :</strong> +241 76 35 90 20</li>
              <li><strong>Email :</strong> ladelicieuse.1@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">2. Hébergement</h2>
            <p>Ce site est hébergé par un prestataire tiers. Pour toute question relative à l'hébergement, contactez-nous à l'adresse ci-dessus.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">3. Propriété intellectuelle</h2>
            <p>L'ensemble des éléments composant ce site (textes, images, logos, graphismes) sont protégés par le droit de la propriété intellectuelle et sont la propriété exclusive de La Délicieuse Diète, sauf mention contraire. Toute reproduction, représentation ou diffusion, en tout ou en partie, du contenu de ce site est interdite sans l'accord préalable écrit de l'éditeur.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">4. Données personnelles</h2>
            <p>Les informations collectées lors de votre utilisation du site font l'objet d'un traitement informatique. Pour en savoir plus sur la collecte et le traitement de vos données, consultez notre <Link to="/politique-confidentialite" className="text-primary underline hover:text-primary/80">Politique de confidentialité</Link>.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">5. Cookies</h2>
            <p>Ce site utilise des cookies techniques nécessaires au bon fonctionnement des services (panier, session utilisateur). Ces cookies ne collectent pas de données personnelles à des fins publicitaires.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">6. Limitation de responsabilité</h2>
            <p>La Délicieuse Diète s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur ce site. Toutefois, elle ne peut garantir l'exhaustivité ou l'absence d'erreur des contenus et décline toute responsabilité en cas d'indisponibilité temporaire du service.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">7. Droit applicable</h2>
            <p>Les présentes mentions légales sont soumises au droit gabonais. Tout litige relatif à l'utilisation du site sera de la compétence exclusive des tribunaux de Libreville (Gabon).</p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
