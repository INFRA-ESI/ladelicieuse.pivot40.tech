import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, X, Loader2 } from '@/components/icons';
import SmartImage from '@/components/SmartImage';
import { resizedUrl } from '@/lib/imageUrl';

interface Props {
  url: string;
  /** Image affichée avant la lecture ; à défaut, `fallbackPoster`. */
  poster?: string;
  fallbackPoster: string;
}

// Section « Comment ça se passe chez nous ». La vidéo (plusieurs Mo) n'est PAS chargée avec la page : on affiche une image,
// et le fichier ne se télécharge qu'au clic, avec un indicateur de chargement et une issue si la connexion échoue.
export default function VideoPresentation({ url, poster, fallbackPoster }: Props) {
  const [open, setOpen] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const close = () => { setOpen(false); setBuffering(true); setFailed(false); };
  const retry = () => { setFailed(false); setBuffering(true); setAttempt(n => n + 1); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <section className="py-20 md:py-28 px-6 md:px-12 bg-background">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <span className="font-body text-xs text-primary mb-4 block">Notre concept</span>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-6">
              Comment ça se passe chez nous ?
            </h2>
            <p className="font-body text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
              Découvrez comment nous préparons nos salades de fruits colorées — des produits frais,
              choisis avec soin, assemblés avec amour à la façon africaine.
            </p>

            <button
              onClick={() => setOpen(true)}
              className="relative group mx-auto block w-full max-w-2xl overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-shadow bg-muted aspect-video"
              aria-label="Lancer la vidéo de présentation"
            >
              <SmartImage
                src={poster || fallbackPoster}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                sizes="(min-width: 672px) 672px, 100vw"
                widths={[320, 480, 640, 960]}
              />
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
                >
                  <Play className="w-8 h-8 text-primary fill-primary ml-1" />
                </motion.div>
              </div>
            </button>
          </motion.div>
        </div>
      </section>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vidéo de présentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="relative w-full max-w-3xl">
            <button onClick={close} className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors" aria-label="Fermer">
              <X className="w-8 h-8" />
            </button>
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl bg-black">
              <video
                key={attempt}
                src={url}
                poster={poster ? resizedUrl(poster, 960) : undefined}
                autoPlay
                controls
                playsInline
                preload="auto"
                className="w-full h-full"
                onCanPlay={() => setBuffering(false)}
                onPlaying={() => setBuffering(false)}
                onWaiting={() => setBuffering(true)}
                onError={() => { setFailed(true); setBuffering(false); }}
              />
              {buffering && !failed && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Loader2 className="w-10 h-10 text-white/90 animate-spin" aria-label="Chargement de la vidéo" />
                </div>
              )}
              {failed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
                  <p className="font-body text-sm text-white">La vidéo n'a pas pu se charger. Vérifiez votre connexion.</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button onClick={retry} className="font-body text-sm px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors">
                      Réessayer
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="font-body text-sm px-5 py-2.5 border border-white/40 text-white rounded-xl hover:bg-white/10 transition-colors">
                      Ouvrir la vidéo
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
