import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, currentSession, refreshSession, subscribeSession, useResource } from './api';
import type { Offer, Page, Session } from './types';

type AuthState = { ready: boolean; session: Session | null };
const AuthContext = createContext<AuthState>({ ready: false, session: null });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(currentSession);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeSession(setSession);
    void refreshSession().catch(() => null).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={{ ready, session }}>{children}</AuthContext.Provider>;
}

type CartLine = { offer: Offer; quantity: number };
type CartState = { lines: CartLine[]; key: string; attemptedFor?: string };
const emptyCart = (): CartState => ({ lines: [], key: crypto.randomUUID() });
const storageKey = 'foodshare.cart.v1';
function loadCart(): CartState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as CartState | null;
    if (saved?.key && Array.isArray(saved.lines) && saved.lines.every((line) =>
      typeof line?.offer?.id === 'string' && Number.isInteger(line.quantity) && line.quantity > 0)) return saved;
  } catch { /* Storage can be disabled. */ }
  return emptyCart();
}

type CartControl = CartState & {
  count: number; total: number;
  validate: (offer: Offer, quantity: number) => string | null;
  add: (offer: Offer, quantity: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  beginReservation: (userId: string) => void;
  clear: () => void;
};
const CartContext = createContext<CartControl | null>(null);
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('CartProvider missing');
  return cart;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState(loadCart);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Storage can be disabled. */ }
  }, [cart]);
  const validate = (offer: Offer, quantity: number) => {
    if (cart.lines.some((line) => line.offer.establishmentId !== offer.establishmentId)) return 'В один заказ можно добавить еду только из одного заведения.';
    const old = cart.lines.find((line) => line.offer.id === offer.id)?.quantity ?? 0;
    if (old + quantity > offer.remainingQuantity || old + quantity > 100) return 'Столько порций сейчас нет в наличии.';
    const offers = [...cart.lines.map((item) => item.offer), offer];
    if (Math.max(...offers.map((item) => Date.parse(item.pickupStartsAt))) >= Math.min(...offers.map((item) => Date.parse(item.pickupEndsAt)))) {
      return 'У предложений должно быть общее окно самовывоза.';
    }
    return null;
  };
  function add(offer: Offer, quantity: number) {
    setCart((previous) => {
      const existing = previous.lines.find((line) => line.offer.id === offer.id);
      const lines = existing
        ? previous.lines.map((line) => line.offer.id === offer.id ? { offer, quantity: line.quantity + quantity } : line)
        : [...previous.lines, { offer, quantity }];
      return { lines, key: crypto.randomUUID() };
    });
  }
  function setQuantity(id: string, quantity: number) {
    setCart((previous) => ({
      lines: previous.lines.flatMap((line) => line.offer.id !== id ? [line]
        : quantity > 0 ? [{ ...line, quantity: Math.min(quantity, line.offer.remainingQuantity, 100) }] : []),
      key: crypto.randomUUID(),
    }));
  }
  const count = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.lines.reduce((sum, line) => sum + line.quantity * line.offer.price, 0);
  return <CartContext.Provider value={{
    ...cart, count, total, validate, add, setQuantity, clear: () => setCart(emptyCart()),
    beginReservation: (userId) => setCart((previous) => ({ ...previous, attemptedFor: userId })),
  }}>{children}</CartContext.Provider>;
}

type FavoritesState = {
  items: Offer[]; loading: boolean; error?: string; hasMore: boolean;
  reload: () => void; has: (id: string) => boolean; toggle: (id: string) => Promise<void>;
  page: number; setPage: (page: number) => void;
};
const FavoritesContext = createContext<FavoritesState | null>(null);
export function useFavorites() {
  const favorites = useContext(FavoritesContext);
  if (!favorites) throw new Error('FavoritesProvider missing');
  return favorites;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.role === 'CUSTOMER' ? session.user.id : undefined;
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Offer>>(userId ? '/favorites?limit=100&page=' + page : null, 'required', userId);
  const [known, setKnown] = useState<{ owner?: string; changes: Record<string, boolean> }>({ changes: {} });
  useEffect(() => {
    if (!resource.data) return;
    setKnown((previous) => ({
      owner: userId,
      changes: {
        ...(previous.owner === userId ? previous.changes : {}),
        ...Object.fromEntries(resource.data!.items.map(({ id }) => [id, true])),
      },
    }));
  }, [resource.data, userId]);
  const has = (id: string) => known.owner === userId && Boolean(known.changes[id]);
  async function toggle(id: string) {
    const usePut = !has(id);
    await api('/favorites/' + id, { mode: 'required', method: usePut ? 'PUT' : 'DELETE' });
    setKnown((previous) => ({ owner: userId, changes: { ...(previous.owner === userId ? previous.changes : {}), [id]: usePut } }));
    resource.reload();
  }
  return <FavoritesContext.Provider value={{
    items: (resource.data?.items ?? []).filter(({ id }) => known.owner !== userId || known.changes[id] !== false),
    loading: resource.loading, error: resource.error, hasMore: resource.data?.hasMore ?? false,
    reload: resource.reload, has, toggle, page, setPage,
  }}>{children}</FavoritesContext.Provider>;
}
