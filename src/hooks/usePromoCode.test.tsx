import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { usePromoCode } from './usePromoCode';
import PromoCodeField from '@/components/PromoCodeField';

const ok = (data: Record<string, unknown>) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const refused = (status: number, message: string) => new Response(JSON.stringify({ success: false, message }), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const bodyOf = (call: number) => JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body));

describe('usePromoCode', () => {
  it('applique un code valide : envoie code et montant d\'articles, garde la réduction, vide le champ', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'BIENVENUE10', remise: 400, type: 'pourcentage' }));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('bienvenue10'));
    await act(async () => { await result.current.apply(); });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/promotions/codes/validate');
    expect(bodyOf(0)).toEqual({ code: 'bienvenue10', montant: 4000 });
    expect(result.current.applied).toEqual({ code: 'BIENVENUE10', remise: 400 });
    expect(result.current.input).toBe('');
    expect(result.current.error).toBe('');
  });

  it('accepte l\'ancien nom de champ « reduction » (serveur d\'avant la mise à jour)', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'X', reduction: 250 }));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('X'));
    await act(async () => { await result.current.apply(); });
    expect(result.current.applied?.remise).toBe(250);
  });

  it.each([
    [404, 'Code promo invalide'],
    [400, 'Code promo expiré'],
    [400, 'Code promo épuisé'],
  ])('code refusé (%i) : le motif du serveur est affiché, aucune réduction', async (status, message) => {
    fetchMock.mockResolvedValue(refused(status, message));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('MAUVAIS'));
    await act(async () => { await result.current.apply(); });
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toBe(message);
  });

  it('trop d\'essais (429) : message dédié', async () => {
    fetchMock.mockResolvedValue(refused(429, 'Too Many Requests'));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    expect(result.current.error).toMatch(/Trop d'essais/);
  });

  it('coupure réseau : message clair, rien d\'appliqué', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    expect(result.current.error).toMatch(/Connexion impossible/);
    expect(result.current.applied).toBeNull();
  });

  it('champ vide : pas de requête', async () => {
    const { result } = renderHook(() => usePromoCode(4000));
    await act(async () => { await result.current.apply(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Saisissez/);
  });

  it('retirer le code remet tout à zéro', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'ABC', remise: 100 }));
    const { result } = renderHook(() => usePromoCode(4000));
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    act(() => result.current.remove());
    expect(result.current.applied).toBeNull();
  });

  it('le panier change : le code est revérifié (avec délai) et la réduction mise à jour', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok({ code: 'ABC', remise: 400 })).mockResolvedValueOnce(ok({ code: 'ABC', remise: 800 }));
    const { result, rerender } = renderHook(({ subtotal }) => usePromoCode(subtotal), { initialProps: { subtotal: 4000 } });
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    rerender({ subtotal: 8000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);                    // pas de requête immédiate
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).toEqual({ code: 'ABC', montant: 8000 });
    expect(result.current.applied?.remise).toBe(800);
  });

  it('plusieurs changements rapides du panier : une seule revérification', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(ok({ code: 'ABC', remise: 100 }));
    const { result, rerender } = renderHook(({ subtotal }) => usePromoCode(subtotal), { initialProps: { subtotal: 4000 } });
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    rerender({ subtotal: 5000 });
    rerender({ subtotal: 6000 });
    rerender({ subtotal: 7000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).montant).toBe(7000);
  });

  it('le panier passe sous le minimum du code : le code est retiré avec une explication', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok({ code: 'GROS', remise: 500 })).mockResolvedValueOnce(refused(400, 'Ce code demande une commande d\'au moins 10 000 FCFA'));
    const { result, rerender } = renderHook(({ subtotal }) => usePromoCode(subtotal), { initialProps: { subtotal: 12000 } });
    act(() => result.current.setInput('GROS'));
    await act(async () => { await result.current.apply(); });
    rerender({ subtotal: 6000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toMatch(/Le code GROS a été retiré : ce code demande une commande/);
  });

  it('coupure réseau pendant la revérification : le code valide est conservé', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok({ code: 'ABC', remise: 400 })).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result, rerender } = renderHook(({ subtotal }) => usePromoCode(subtotal), { initialProps: { subtotal: 4000 } });
    act(() => result.current.setInput('ABC'));
    await act(async () => { await result.current.apply(); });
    rerender({ subtotal: 5000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.applied?.code).toBe('ABC');
    expect(result.current.error).toBe('');
  });
});

describe('PromoCodeField', () => {
  const Harness = ({ subtotal = 4000 }: { subtotal?: number }) => {
    const promo = usePromoCode(subtotal);
    return <PromoCodeField promo={promo} />;
  };

  it('champ en majuscules, bouton inactif tant que rien n\'est saisi, Entrée applique sans envoyer le formulaire', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'ABC', remise: 400 }));
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(<form onSubmit={onSubmit as never}><Harness /></form>);
    const button = screen.getByRole('button', { name: 'Appliquer' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const input = screen.getByLabelText('Code promo (facultatif)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('ABC');
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText(/Code ABC appliqué : −/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('code appliqué : montant de la réduction affiché et bouton « Retirer »', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'ABC', remise: 400 }));
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Code promo (facultatif)'), { target: { value: 'ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Code ABC appliqué : −400/);
    fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
    expect(await screen.findByLabelText('Code promo (facultatif)')).toBeTruthy();
  });

  it('code refusé : message d\'erreur annoncé, champ marqué invalide', async () => {
    fetchMock.mockResolvedValue(refused(404, 'Code promo invalide'));
    render(<Harness />);
    const input = screen.getByLabelText('Code promo (facultatif)');
    fireEvent.change(input, { target: { value: 'NOPE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Code promo invalide');
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
  });
});
