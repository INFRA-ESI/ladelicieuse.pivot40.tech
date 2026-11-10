import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, renderHook, screen, act } from '@testing-library/react';
import TablePagination from './TablePagination';
import { usePagination } from '@/hooks/usePagination';

const props = { page: 3, pageCount: 8, total: 78, pageSize: 10, onPageChange: vi.fn() };

describe('TablePagination', () => {
  beforeEach(() => { props.onPageChange.mockClear(); localStorage.clear(); });

  it('ne s\'affiche pas quand tout tient sur une page de 10 lignes', () => {
    const { container } = render(<TablePagination {...props} total={10} pageCount={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('indique la plage affichée et propose précédent / suivant', () => {
    render(<TablePagination {...props} />);
    expect(screen.getByText('21–30 sur 78')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Suivant/ })[0]);
    expect(props.onPageChange).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getAllByRole('button', { name: /Précédent/ })[0]);
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('désactive précédent sur la première page et suivant sur la dernière', () => {
    const { rerender } = render(<TablePagination {...props} page={1} />);
    expect(screen.getAllByRole('button', { name: /Précédent/ })[0]).toBeDisabled();
    rerender(<TablePagination {...props} page={8} />);
    expect(screen.getAllByRole('button', { name: /Suivant/ })[0]).toBeDisabled();
  });

  it('marque la page courante et saute aux numéros', () => {
    render(<TablePagination {...props} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '8' }));
    expect(props.onPageChange).toHaveBeenCalledWith(8);
  });

  it('propose le nombre de lignes par page quand on lui donne de quoi le changer', () => {
    const setPageSize = vi.fn();
    render(<TablePagination {...props} setPageSize={setPageSize} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(setPageSize).toHaveBeenCalledWith(50);
  });
});

describe('usePagination', () => {
  beforeEach(() => localStorage.clear());
  const items = Array.from({ length: 45 }, (_, i) => i);

  it('découpe par 10 par défaut', () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.pageItems).toHaveLength(10);
    expect(result.current.pageCount).toBe(5);
  });

  it('change le nombre de lignes, revient à la page 1 et s\'en souvient', () => {
    const { result, unmount } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(20));
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(20);
    expect(result.current.pageCount).toBe(3);
    unmount();
    expect(renderHook(() => usePagination(items)).result.current.pageSize).toBe(20);
  });

  it('ignore une valeur retenue qui ne fait pas partie des choix', () => {
    localStorage.setItem('ladelicieuse_page_size', '7');
    expect(renderHook(() => usePagination(items)).result.current.pageSize).toBe(10);
  });
});
