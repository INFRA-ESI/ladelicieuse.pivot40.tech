import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import VideoPresentation from './VideoPresentation';

// jsdom n'a pas IntersectionObserver, que framer-motion utilise pour les animations à l'arrivée à l'écran.
beforeAll(() => {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as unknown as typeof IntersectionObserver;
});

const props = { url: '/uploads/presentation.mp4', poster: '/uploads/miniature.webp', fallbackPoster: '/assets/defaut.webp' };

describe('VideoPresentation', () => {
  it('n\'ajoute aucune balise vidéo à la page tant que personne ne lance la lecture', () => {
    const { container } = render(<VideoPresentation {...props} />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/uploads/miniature.webp');
  });

  it('affiche l\'image par défaut quand il n\'y a pas de miniature', () => {
    const { container } = render(<VideoPresentation url={props.url} fallbackPoster={props.fallbackPoster} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/assets/defaut.webp');
  });

  it('charge la vidéo au clic, avec l\'indicateur de chargement', () => {
    render(<VideoPresentation {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la vidéo de présentation' }));
    const video = document.querySelector('video');
    expect(video?.getAttribute('src')).toBe(props.url);
    expect(video).toHaveAttribute('preload', 'auto');
    expect(screen.getByLabelText('Chargement de la vidéo')).toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue, puis recharge la vidéo', () => {
    render(<VideoPresentation {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la vidéo de présentation' }));
    const first = document.querySelector('video')!;
    fireEvent.error(first);
    expect(screen.getByText(/n'a pas pu se charger/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la vidéo' })).toHaveAttribute('href', props.url);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(document.querySelector('video')).not.toBe(first);
    expect(screen.queryByText(/n'a pas pu se charger/)).toBeNull();
  });

  it('se ferme avec Échap et retire la vidéo', () => {
    render(<VideoPresentation {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la vidéo de présentation' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('video')).toBeNull();
  });
});
