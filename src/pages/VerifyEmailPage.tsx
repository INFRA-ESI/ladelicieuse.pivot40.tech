import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Leaf } from '@/components/icons';
import logo from '@/assets/logo.png';

type State = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Lien invalide — aucun token trouvé.');
      return;
    }

    fetch(`/api/client/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setState('success');
          setMessage(data.message || 'Votre adresse email a été confirmée avec succès.');
        } else {
          setState('error');
          setMessage(data.message || 'Lien invalide ou expiré.');
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Erreur réseau. Veuillez réessayer plus tard.');
      });
  }, []);

  return (
    /* Fond — identique au wrapper email */
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
         style={{ backgroundColor: '#e4ebe2' }}>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full"
        style={{ maxWidth: 520 }}
      >
        {/* Carte — identique à la table email */}
        <div style={{ background: '#ffffff', border: '1px solid #d0dccb' }} className="overflow-hidden">

          {/* ── Header — identique au bloc header() email ── */}
          <div style={{ backgroundColor: '#1c4028', padding: '40px 48px 32px', textAlign: 'center' }}>
            <div className="flex items-center justify-center gap-3 mb-2">
              <img src={logo} alt="La Délicieuse Diète" style={{ height: 40, width: 'auto' }} />
            </div>
            <p style={{
              margin: '0 0 4px',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 26,
              fontWeight: 400,
              color: '#ffffff',
            }}>
              La Délicieuse Diète
            </p>
            <p style={{
              margin: 0,
              fontFamily: 'Lato, Arial, sans-serif',
              fontSize: 12,
              color: '#267340',
            }}>
              Activation de compte
            </p>
          </div>

          {/* Ligne d'accent verte — identique à la bande email */}
          <div style={{ height: 3, backgroundColor: '#267340' }} />

          {/* ── Contenu ── */}
          <div style={{ padding: '48px' }}>
            <AnimatePresence mode="wait">

              {/* LOADING */}
              {state === 'loading' && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ textAlign: 'center' }}
                >
                  <Loader2
                    className="animate-spin mx-auto mb-6"
                    style={{ width: 40, height: 40, color: '#267340' }}
                  />
                  <p style={{
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    fontSize: 22,
                    fontWeight: 400,
                    color: '#1c4028',
                    margin: '0 0 8px',
                  }}>
                    Vérification en cours…
                  </p>
                  <p style={{
                    fontFamily: 'Lato, Arial, sans-serif',
                    fontSize: 14,
                    color: '#7a9488',
                    margin: 0,
                  }}>
                    Merci de patienter quelques instants.
                  </p>
                </motion.div>
              )}

              {/* SUCCESS */}
              {state === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Petit label — style email */}
                  <p style={{
                    margin: '0 0 4px',
                    fontFamily: 'Lato, Arial, sans-serif',
                    fontSize: 12,
                    color: '#7a9488',
                  }}>
                    Compte activé
                  </p>

                  {/* Titre serif — style email */}
                  <p style={{
                    margin: '0 0 28px',
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    fontSize: 28,
                    fontWeight: 400,
                    color: '#1c4028',
                  }}>
                    Bienvenue chez nous
                  </p>

                  {/* Icône succès */}
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                      width: 64, height: 64,
                      borderRadius: '50%',
                      backgroundColor: '#f4f7f2',
                      border: '1px solid #d0dccb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto',
                    }}>
                      <CheckCircle2 style={{ width: 32, height: 32, color: '#267340' }} />
                    </div>
                  </div>

                  {/* Corps de texte — style email */}
                  <p style={{
                    margin: '0 0 28px',
                    fontFamily: 'Lato, Arial, sans-serif',
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: '#4a6357',
                  }}>
                    {message}
                  </p>

                  {/* Séparateur */}
                  <div style={{ height: 1, backgroundColor: '#e4ebe2', margin: '0 0 28px' }} />

                  {/* Bloc fidélité — style email */}
                  <div style={{
                    backgroundColor: '#f4f7f2',
                    border: '1px solid #e4ebe2',
                    padding: '20px 24px',
                    marginBottom: 32,
                  }}>
                    <p style={{
                      margin: '0 0 4px',
                      fontFamily: 'Lato, Arial, sans-serif',
                      fontSize: 12,
                      color: '#7a9488',
                    }}>
                      Votre statut
                    </p>
                    <p style={{
                      margin: '0 0 4px',
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      fontSize: 20,
                      color: '#267340',
                    }}>
                      Membre Bronze
                    </p>
                    <p style={{
                      margin: 0,
                      fontFamily: 'Lato, Arial, sans-serif',
                      fontSize: 12,
                      color: '#7a9488',
                    }}>
                      Programme de fidélité · Gagnez des points à chaque commande
                    </p>
                  </div>

                  {/* Bouton CTA — style email */}
                  <div style={{ textAlign: 'center' }}>
                    <Link
                      to="/connexion"
                      style={{
                        display: 'inline-block',
                        backgroundColor: '#267340',
                        color: '#ffffff',
                        textDecoration: 'none',
                        padding: '16px 44px',
                        fontFamily: 'Lato, Arial, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 4,
                      }}
                    >
                      Se connecter
                    </Link>
                  </div>
                </motion.div>
              )}

              {/* ERROR */}
              {state === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <p style={{
                    margin: '0 0 4px',
                    fontFamily: 'Lato, Arial, sans-serif',
                    fontSize: 12,
                    color: '#7a9488',
                  }}>
                    Échec de la vérification
                  </p>

                  <p style={{
                    margin: '0 0 28px',
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    fontSize: 28,
                    fontWeight: 400,
                    color: '#1c4028',
                  }}>
                    Lien invalide
                  </p>

                  {/* Icône erreur */}
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                      width: 64, height: 64,
                      borderRadius: '50%',
                      backgroundColor: '#f4f7f2',
                      border: '1px solid #d0dccb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto',
                    }}>
                      <XCircle style={{ width: 32, height: 32, color: '#e6352a' }} />
                    </div>
                  </div>

                  <p style={{
                    margin: '0 0 24px',
                    fontFamily: 'Lato, Arial, sans-serif',
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: '#4a6357',
                  }}>
                    {message}
                  </p>

                  {/* Bloc alerte — style email */}
                  <div style={{
                    backgroundColor: '#f4f7f2',
                    padding: '14px 18px',
                    marginBottom: 32,
                  }}>
                    <p style={{
                      margin: 0,
                      fontFamily: 'Lato, Arial, sans-serif',
                      fontSize: 12,
                      color: '#4a6357',
                      lineHeight: 1.6,
                    }}>
                      Le lien d'activation est valable <strong style={{ color: '#1c4028' }}>24 heures</strong> après
                      réception de l'email. Créez un nouveau compte ou contactez-nous si besoin.
                    </p>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <Link
                      to="/connexion"
                      style={{
                        display: 'inline-block',
                        backgroundColor: '#1c4028',
                        color: '#ffffff',
                        textDecoration: 'none',
                        padding: '16px 44px',
                        fontFamily: 'Lato, Arial, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 4,
                      }}
                    >
                      Retour à la connexion
                    </Link>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Footer — identique au bloc footer() email ── */}
          <div>
            <div style={{ height: 1, backgroundColor: '#d0dccb' }} />
            <div style={{
              backgroundColor: '#f4f7f2',
              padding: '28px 48px',
              textAlign: 'center',
            }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Leaf style={{ width: 12, height: 12, color: '#267340' }} />
                <p style={{
                  margin: 0,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: 14,
                  fontWeight: 400,
                  color: '#267340',
                }}>
                  La Délicieuse Diète
                </p>
                <Leaf style={{ width: 12, height: 12, color: '#267340' }} />
              </div>
              <p style={{
                margin: '0 0 4px',
                fontFamily: 'Lato, Arial, sans-serif',
                fontSize: 11,
                color: '#7a9488',
              }}>
                Cuisine saine &amp; savoureuse · Libreville, Gabon
              </p>
              <p style={{
                margin: 0,
                fontFamily: 'Lato, Arial, sans-serif',
                fontSize: 12,
                color: '#d0dccb',
              }}>
                © {new Date().getFullYear()} La Délicieuse · Tous droits réservés
              </p>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
