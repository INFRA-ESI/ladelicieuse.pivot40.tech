import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { resizedUrl, srcSetFor } from '@/lib/imageUrl';

const DEFAULT_WIDTHS = [320, 480, 640, 960, 1280] as const;

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'loading'> {
  src: string;
  alt: string;
  /** Largeur d'affichage selon l'écran, par exemple « (min-width: 768px) 33vw, 100vw ». Par défaut : toute la largeur. */
  sizes?: string;
  widths?: readonly number[];
  /** Image visible dès l'ouverture de la page (bannière) : chargée tout de suite et en premier. */
  priority?: boolean;
  /** Affiché quand l'image ne se charge pas. */
  fallback?: React.ReactNode;
}

// Image du site : charge la taille adaptée à l'écran (WebP réduit pour les images du back office), ne charge
// que ce qui approche de l'écran, apparaît en fondu au lieu de « sauter », et ne laisse pas d'icône cassée.
export default function SmartImage({ src, alt, className, sizes = '100vw', widths = DEFAULT_WIDTHS, priority, fallback = null, onLoad, onError, ...rest }: SmartImageProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (state === 'failed') return <>{fallback}</>;

  const srcSet = srcSetFor(src, widths);
  const middle = widths[Math.floor(widths.length / 2)];
  return (
    <img
      {...rest}
      ref={el => { if (el?.complete && el.naturalWidth > 0 && state === 'loading') setState('ready'); }}
      src={srcSet ? resizedUrl(src, middle) : src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      onLoad={e => { setState('ready'); onLoad?.(e); }}
      onError={e => { setState('failed'); onError?.(e); }}
      className={cn('transition-opacity duration-300', state === 'ready' ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}
