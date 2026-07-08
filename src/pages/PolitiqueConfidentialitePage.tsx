import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/Footer';

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen pt-24 pb-20 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
        </Link>

        <h1 className="font-display text-4xl text-foreground mb-2">Politique de confidentialité</h1>
        <p className="font-body text-sm text-muted-foreground mb-10">Dernière mise à jour : juin 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 font-body text-foreground/80">
          <section>
            <h2 className="font-display text-xl text-foreground mb-3">1. Responsable du traitement</h2>
            <p>Le responsable du traitement des données personnelles collectées via ce site est :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>La Délicieuse Diète</strong></li>
              <li>Quartier Louis, Libreville, Gabon</li>
              <li>ladelicieuse.1@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">2. Données collectées</h2>
            <p>Lors de votre utilisation du site, nous collectons les informations suivantes :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Données d'identification :</strong> nom, prénom(s), adresse email, numéro de téléphone</li>
              <li><strong>Données de livraison :</strong> adresse postale pour les commandes</li>
              <li><strong>Données de commandes :</strong> historique des achats, préférences alimentaires</li>
              <li><strong>Données de connexion :</strong> adresse IP, données de navigation (cookies techniques)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">3. Finalités du traitement</h2>
            <p>Vos données sont collectées pour les finalités suivantes :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Gestion des commandes et de la livraison</li>
              <li>Création et gestion de votre compte client</li>
              <li>Programme de fidélité</li>
              <li>Communication relative à votre commande (email de confirmation, suivi)</li>
              <li>Amélioration de nos services</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">4. Base légale</h2>
            <p>Le traitement de vos données repose sur :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>L'exécution du contrat (traitement de vos commandes)</li>
              <li>Votre consentement (création de compte, préférences)</li>
              <li>Notre intérêt légitime (amélioration du service, sécurité)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">5. Durée de conservation</h2>
            <p>Vos données sont conservées pendant la durée nécessaire à l'exécution de nos services et conformément aux obligations légales applicables. Les données de compte sont supprimées sur demande ou après 3 ans d'inactivité.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">6. Partage des données</h2>
            <p>Vos données ne sont pas vendues à des tiers. Elles peuvent être partagées uniquement avec nos prestataires de services (paiement, livraison) dans le cadre strict de l'exécution de votre commande.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">7. Vos droits</h2>
            <p>Conformément à la réglementation applicable, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Droit d'accès à vos données</li>
              <li>Droit de rectification</li>
              <li>Droit à l'effacement (« droit à l'oubli »)</li>
              <li>Droit d'opposition au traitement</li>
              <li>Droit à la portabilité de vos données</li>
            </ul>
            <p className="mt-3">Pour exercer ces droits, contactez-nous à : <a href="mailto:ladelicieuse.1@gmail.com" className="text-primary underline">ladelicieuse.1@gmail.com</a></p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">8. Sécurité</h2>
            <p>Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données contre tout accès non autorisé, perte ou altération (chiffrement AES-256, HTTPS, jetons JWT).</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">9. Cookies</h2>
            <p>Ce site utilise uniquement des cookies techniques strictement nécessaires au bon fonctionnement des services (gestion de session, panier). Aucun cookie publicitaire ou de traçage tiers n'est utilisé.</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-foreground mb-3">10. Contact</h2>
            <p>Pour toute question relative à cette politique, contactez-nous :</p>
            <p className="mt-2">
              <strong>La Délicieuse Diète</strong><br />
              Quartier Louis, Libreville, Gabon<br />
              <a href="mailto:ladelicieuse.1@gmail.com" className="text-primary underline">ladelicieuse.1@gmail.com</a><br />
              +241 76 35 90 20
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
