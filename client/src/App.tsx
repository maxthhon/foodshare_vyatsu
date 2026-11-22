import { ClipboardList, Heart, House, Map, MapPin, ShoppingBag, Store, UserRound } from 'lucide-react';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Catalog, FavoritesPage, OfferPage } from './Catalog';
import { AuthPage, CartPage, OrderPage, OrdersPage, ProfilePage } from './Customer';
import { AuthProvider, CartProvider, FavoritesProvider, useAuth, useCart } from './state';
import type { Role } from './types';
import { Brand, Empty, Loading } from './ui';

const Business = lazy(() => import('./Business'));
const MapPage = lazy(() => import('./MapPage'));
const customerNav = [
  { to: '/', label: 'Главная', icon: House },
  { to: '/map', label: 'Карта', icon: Map },
  { to: '/orders', label: 'Заказы', icon: ClipboardList },
  { to: '/favorites', label: 'Избранное', icon: Heart },
  { to: '/profile', label: 'Профиль', icon: UserRound },
];

function Gate({ role, children }: { role: Role; children: ReactNode }) {
  const { ready, session } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!session) return <Navigate to="/auth" state={{ from: location.pathname + location.search }} replace />;
  if (session.user.role !== role) return <Navigate to={session.user.role === 'ESTABLISHMENT' ? '/business' : '/profile'} replace />;
  return children;
}

function OrderRoute() {
  const { id } = useParams();
  return <OrderPage key={id} />;
}

function OfferRoute() {
  const { id } = useParams();
  return <OfferPage key={id} />;
}

function Header() {
  const { session } = useAuth();
  const cart = useCart();
  const business = session?.user.role === 'ESTABLISHMENT';
  return <>
    <header className="site-header">
      <div className="site-width header-layout">
        <div className="brand-group"><Brand /><span className="header-location"><MapPin size={16} /> Киров</span></div>
        {!business && <nav className="desktop-nav" aria-label="Главное меню">
          {customerNav.slice(0, 4).map(({ to, label }) => <NavLink key={to} end={to === '/'} to={to}>{label}</NavLink>)}
        </nav>}
        <div className="header-actions">{business ? <>
          <Link className="button text-button hide-small" to="/">Витрина</Link><NavLink to="/business" className="button primary"><Store size={18} /> Кабинет</NavLink>
        </> : <>
          <NavLink to="/cart" className="icon-button header-cart" aria-label={cart.count ? `Корзина, позиций: ${cart.count}` : 'Корзина'}>
            <ShoppingBag size={20} />{cart.count > 0 && <span>{cart.count}</span>}</NavLink>
          {session ? <NavLink to="/profile" className="icon-button header-profile" aria-label="Профиль"><UserRound size={20} /></NavLink>
            : <Link to="/auth" className="button primary small-signin"><UserRound size={17} />Войти</Link>}
        </>}</div>
      </div>
    </header>
    {!business && <nav className="mobile-nav" aria-label="Основные разделы">
      {customerNav.map(({ to, label, icon: Icon }) => <NavLink to={to} key={to} end={to === '/'}><Icon size={21} /><span>{label}</span></NavLink>)}
    </nav>}
  </>;
}

function Shell() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo({ top: 0 }); }, [pathname, hash]);
  return <>
    <a className="skip-link" href="#main-content">К содержанию</a>
    <Header />
    <main id="main-content" className="site-width site-main">
      <Suspense fallback={<Loading />}><Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/offers/:id" element={<OfferRoute />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders" element={<Gate role="CUSTOMER"><OrdersPage /></Gate>} />
        <Route path="/orders/:id" element={<Gate role="CUSTOMER"><OrderRoute /></Gate>} />
        <Route path="/favorites" element={<Gate role="CUSTOMER"><FavoritesPage /></Gate>} />
        <Route path="/profile" element={<Gate role="CUSTOMER"><ProfilePage /></Gate>} />
        <Route path="/business/*" element={<Gate role="ESTABLISHMENT"><Business /></Gate>} />
        <Route path="*" element={<Empty title="Страница не найдена"><Link className="button primary" to="/">На главную</Link></Empty>} />
      </Routes></Suspense>
    </main>
    <footer className="site-footer"><div className="site-width footer-layout">
      <Brand /><span className="meta"><MapPin size={16} />Киров</span><Link className="text-link" to="/map">Карта заведений</Link>
    </div></footer>
  </>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><CartProvider><FavoritesProvider><Shell /></FavoritesProvider></CartProvider></AuthProvider></BrowserRouter>;
}
