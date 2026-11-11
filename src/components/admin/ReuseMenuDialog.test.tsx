import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ adminGet: vi.fn(), adminPost: vi.fn() }));
vi.mock('@/services/adminApiService', () => api);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ReuseMenuDialog from './ReuseMenuDialog';

const pad = (n: number) => String(n).padStart(2, '0');
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const TODAY = day(0);
const TOMORROW = day(1);
const IN3 = day(3);

const open = (over: Partial<{ date: string; mealsCount: number }> = {}, schedule: unknown[] = []) => {
  api.adminGet.mockResolvedValue({ data: schedule });
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<ReuseMenuDialog date={TODAY} mealsCount={3} onClose={onClose} onDone={onDone} {...over} />);
  return { onClose, onDone };
};

const addDate = (value: string) => {
  fireEvent.change(screen.getByLabelText('Dates de destination'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('ReuseMenuDialog — copier ce menu vers d\'autres dates', () => {
  it('explique que chaque date reçoit sa propre copie', async () => {
    open();
    expect(await screen.findByText(/modifier l'une ne modifie jamais les autres/)).toBeTruthy();
  });

  it('envoie la source, les dates choisies, « ignorer » par défaut et pas de publication', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [{ date: TOMORROW, meals: 3, published: false }], replaced: [], skipped: [], failed: [] } });
    const { onDone } = open();
    addDate(TOMORROW);
    addDate(IN3);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    await screen.findByText(/3 repas copié, en brouillon/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', { source: TODAY, targets: [TOMORROW, IN3], onConflict: 'skip' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('« Publier les menus copiés » coché : published: true', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [{ date: TOMORROW, meals: 3, published: true }], replaced: [], skipped: [], failed: [] } });
    open();
    addDate(TOMORROW);
    fireEvent.click(screen.getByLabelText(/Publier les menus copiés/));
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    await screen.findByText(/publié$/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', expect.objectContaining({ published: true }));
  });

  it('aucune date choisie : le bouton reste inactif', async () => {
    open();
    expect((await screen.findByRole('button', { name: 'Copier le menu' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuse une date passée ou la date du menu lui-même', async () => {
    open();
    addDate(day(-1));
    addDate(TODAY);
    expect(screen.queryByRole('button', { name: /Retirer le/ })).toBeNull();
  });

  it('le même jour ajouté deux fois n\'apparaît qu\'une fois', async () => {
    open();
    addDate(TOMORROW);
    addDate(TOMORROW);
    expect(screen.getAllByRole('button', { name: /Retirer le/ })).toHaveLength(1);
  });

  it('une date qui a déjà un menu est signalée ; sans case « Remplacer », onConflict reste « skip »', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [], replaced: [], skipped: [{ date: TOMORROW, reason: 'Un menu existe déjà à cette date.' }], failed: [] } });
    const { onDone } = open({}, [{ date: TOMORROW, meals: 2, published: true }]);
    await waitFor(() => expect(api.adminGet).toHaveBeenCalled());
    addDate(TOMORROW);
    expect(await screen.findByText(/Menu existant \(2 repas, publié\)/)).toBeTruthy();
    expect(screen.getByText(/Un menu existe déjà à cette date/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    await screen.findByText(/ignoré/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', expect.objectContaining({ onConflict: 'skip' }));
    expect(onDone).not.toHaveBeenCalled();   // rien n'a changé : pas de rechargement
  });

  it('case « Remplacer les menus existants » : onConflict « replace » et bouton explicite', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [], replaced: [{ date: TOMORROW, meals: 3, published: true }], skipped: [], failed: [] } });
    open({}, [{ date: TOMORROW, meals: 2, published: true }]);
    await waitFor(() => expect(api.adminGet).toHaveBeenCalled());
    addDate(TOMORROW);
    await screen.findByText(/Menu existant/);
    fireEvent.click(screen.getByLabelText(/Remplacer les menus existants/));
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer et copier' }));
    await screen.findByText(/3 repas remplacé/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', expect.objectContaining({ onConflict: 'replace' }));
  });

  it('échec côté serveur pour une date : message d\'alerte, les autres sont listées', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [{ date: TOMORROW, meals: 3, published: false }], replaced: [], skipped: [], failed: [{ date: IN3, reason: 'La copie a échoué, rien n\'a été modifié pour cette date.' }] } });
    open();
    addDate(TOMORROW);
    addDate(IN3);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/La copie a échoué/);
    expect(screen.getByText(/3 repas copié/)).toBeTruthy();
  });

  it('erreur réseau : la fenêtre reste ouverte, rien n\'est affiché comme réussi', async () => {
    api.adminPost.mockRejectedValue(new Error('Réseau coupé'));
    const { onDone } = open();
    addDate(TOMORROW);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    await waitFor(() => expect(api.adminPost).toHaveBeenCalled());
    expect(screen.queryByText(/repas copié/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('jour sans repas : l\'option « vers d\'autres dates » le dit, et la copie n\'est pas proposée', async () => {
    open({ mealsCount: 0 });
    // sans repas, la fenêtre s'ouvre directement sur « Copier un autre menu ici »
    expect(await screen.findByText(/Destination :/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /vers d'autres dates/ }));
    expect(screen.getByText(/n'a pas encore de repas/)).toBeTruthy();
  });
});

describe('ReuseMenuDialog — copier un autre menu ici', () => {
  const schedule = [
    { date: day(-2), meals: 4, published: true },
    { date: day(-5), meals: 2, published: false },
    { date: TODAY, meals: 0, published: false },
  ];

  it('liste les menus existants (sauf la date courante) et copie le choisi vers la date affichée', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [{ date: TODAY, meals: 4, published: false }], replaced: [], skipped: [], failed: [] } });
    const { onDone } = open({ mealsCount: 0 }, schedule);
    fireEvent.click(await screen.findByRole('radio', { name: /4 repas, publié/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copier le menu' }));
    await screen.findByText(/4 repas copié/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', { source: day(-2), targets: [TODAY], onConflict: 'skip' });
    expect(onDone).toHaveBeenCalled();
  });

  it('aucun menu choisi : le bouton reste inactif', async () => {
    open({ mealsCount: 0 }, schedule);
    await screen.findByRole('radio', { name: /4 repas/ });
    expect((screen.getByRole('button', { name: 'Copier le menu' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('la date affichée a déjà des repas : avertissement, remplacement seulement si la case est cochée', async () => {
    api.adminPost.mockResolvedValue({ data: { created: [], replaced: [{ date: TODAY, meals: 4, published: false }], skipped: [], failed: [] } });
    open({ mealsCount: 2 }, [{ date: TODAY, meals: 2, published: false }, ...schedule.slice(0, 2)]);
    fireEvent.click(await screen.findByRole('radio', { name: /Copier un autre menu ici/ }));
    expect(await screen.findByText(/a déjà 2 repas/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('radio', { name: /4 repas, publié/ }));
    expect(screen.getByText(/Un menu existe déjà à cette date/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Remplacer les menus existants/));
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer et copier' }));
    await screen.findByText(/remplacé/);
    expect(api.adminPost).toHaveBeenCalledWith('/menu/duplicate', expect.objectContaining({ onConflict: 'replace', targets: [TODAY] }));
  });
});
