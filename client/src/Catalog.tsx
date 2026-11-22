import { Coffee, Croissant, Heart, Leaf, LocateFixed, MapPin, Search, ShoppingBag, SlidersHorizontal, Store, Timer, Utensils, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, message, useResource } from './api';
import { money, number, offerCategories, offerPhoto, pickupWindow, queryString, shortDate, venueCategories } from './format';
import { useAuth, useCart, useFavorites } from './state';
import type { Allergen, Offer, OfferCategory, Page, Review, Venue, VenueCategory } from './types';
import { Dialog, Empty, ErrorState, Loading, Notice, PageTitle, Pagination, Place } from './ui';

const shortcuts = [
  { id: 'COFFEE_SHOP', icon: Coffee, color: 'peach' },
  { id: 'BAKERY', icon: Croissant, color: 'yellow' },
  { id: 'RESTAURANT', icon: Utensils, color: 'rose' },
  { id: 'STORE', icon: Store, color: 'mint' },
] as const;

type Coordinates = { lat: number; lng: number };
export function locate(setLocation: (location: Coordinates) => void, onError: (error: string) => void, settle: () => void) {
  if (!navigator.geolocation) {
    onError('Геолокация недоступна. Можно выбрать предложение по адресу.');
    settle();
    return;
  }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    setLocation({ lat: coords.latitude, lng: coords.longitude });
    settle();
  }, () => {
    onError('Не удалось получить геопозицию. Проверьте разрешение браузера.');
    settle();
  }, { timeout: 8000, maximumAge: 60_000 });
}

function FavoriteButton({ id }: { id: string }) {
  const favorites = useFavorites();
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = favorites.has(id);
  async function toggle() {
    if (!session) {
      navigate('/auth', { state: { from: location.pathname + location.search + location.hash } });
      return;
    }
    setBusy(true);
    setError('');
    try { await favorites.toggle(id); } catch (issue) { setError(message(issue)); }
    finally { setBusy(false); }
  }
  if (session?.user.role === 'ESTABLISHMENT') return null;
  return <div className="favorite-control">
    <button className={`icon-button favorite ${selected ? 'liked' : ''}`} aria-label={selected ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={selected} disabled={busy} onClick={() => void toggle()}><Heart size={20} fill={selected ? 'currentColor' : 'none'} /></button>
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function OfferCard({ offer }: { offer: Offer }) {
  return <article className="offer-card">
    <div className="offer-image">
      <Link to={`/offers/${offer.id}`} aria-label={offer.name}><img src={offerPhoto(offer)} alt="" loading="lazy" /></Link>
      {offer.discountPercent > 0 && <span className="discount">−{offer.discountPercent}%</span>}
      <FavoriteButton id={offer.id} />
    </div>
    <div className="offer-info">
      <span className="eyeline">{offer.establishment.name}</span>
      <h3><Link to={`/offers/${offer.id}`}>{offer.name}</Link></h3>
      <p className="meta"><Timer size={16} />{pickupWindow(offer.pickupStartsAt, offer.pickupEndsAt)}</p>
      <div className="offer-tags">
        {offer.size && <span className="chip">Бокс {offer.size}</span>}
        {offer.distanceKm !== null && <span className="chip">{number(offer.distanceKm)} км</span>}
        <span className="chip stock">Осталось {offer.remainingQuantity}</span>
      </div>
      {offer.allergens.length > 0 && <p className="card-allergens">Аллергены: {offer.allergens.map((item) => item.name).join(', ')}</p>}
      {offer.containsUserAllergens && <p className="allergy-text">Есть аллергены из вашего профиля</p>}
      <div className="offer-bottom">
        <div className="price"><strong>{money(offer.price)}</strong>{offer.originalPrice > offer.price && <del>{money(offer.originalPrice)}</del>}</div>
        <Link className="text-link offer-open" to={`/offers/${offer.id}`} aria-label={`Подробнее о «${offer.name}»`}>Подробнее</Link>
      </div>
    </div>
  </article>;
}

export function Catalog() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const venue = params.get('venue') ?? undefined;
  const [search, setSearch] = useState('');
  const [submitted, submit] = useState('');
  const [shortcut, setShortcut] = useState<VenueCategory | ''>('');
  const [category, setCategory] = useState<OfferCategory | ''>('');
  const [type, setType] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [exclude, setExclude] = useState<string[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [radius, setRadius] = useState('5');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [pagination, setPagination] = useState({ venue, page: 1 });
  const activePage = pagination.venue === venue ? pagination.page : 1;
  const filtersActive = [category, type, min, max, ...exclude, coordinates].filter(Boolean).length;
  const validPrices = !min || !max || Number(min) <= Number(max);
  const matches = useResource<Page<Offer>>(validPrices ? '/boxes' + queryString({
    establishmentId: venue, q: submitted, establishmentCategory: shortcut, category, type,
    minPrice: min ? Math.round(Number(min) * 100) : undefined, maxPrice: max ? Math.round(Number(max) * 100) : undefined,
    excludeAllergens: exclude.join(','), lat: coordinates?.lat, lng: coordinates?.lng,
    radiusKm: coordinates ? radius : undefined, page: activePage, limit: 12,
  }) : null, 'optional', session?.user.id);
  const allergens = useResource<Allergen[]>(filtersOpen ? '/allergens' : null);
  const venues = useResource<Page<Pick<Venue, 'id' | 'name'>>>(filtersOpen ? '/establishments' + queryString({
    limit: 100, q: venueSearch.trim(),
  }) : null);
  const selectedVenue = useResource<Venue>(venue ? '/establishments/' + venue : null);
  useEffect(() => {
    if (location.hash === '#offers') document.getElementById('offers')?.scrollIntoView({ block: 'start' });
  }, [location.hash, venue]);
  const resetPage = () => setPagination({ venue, page: 1 });
  function reset() {
    setShortcut(''); setCategory(''); setType(''); setMin(''); setMax(''); setExclude([]);
    setCoordinates(undefined); setGeoError(''); setVenueSearch(''); setSearch(''); submit(''); resetPage(); setParams({});
  }
  function find(event: FormEvent) {
    event.preventDefault(); submit(search.trim()); resetPage();
  }
  return <>
    {!venue && <section className="hero">
      <div className="hero-copy">
        <div className="hero-location"><MapPin size={16} /> Киров</div>
        <h1>Спасайте еду<br />рядом с домом</h1>
        <p>Забирайте готовую еду из кафе и пекарен со скидкой до 70%.</p>
        <Link className="button bright" to="#offers"><ShoppingBag size={18} /> Смотреть предложения</Link>
      </div>
      <div className="hero-photo"><img src="/food/hero.webp" alt="Выпечка и сэндвич в коробке для самовывоза" fetchPriority="high" /></div>
    </section>}
    {!venue && <section className="category-section" aria-label="Заведения по категориям">
      <h2>Категории</h2><div className="categories">
        {shortcuts.map(({ id, icon: Icon, color }) => <button key={id} className={`category-button ${shortcut === id ? 'selected' : ''}`}
          aria-pressed={shortcut === id} onClick={() => { setShortcut(shortcut === id ? '' : id); resetPage(); }}>
          <span className={`category-icon ${color}`}><Icon size={24} /></span><span>{venueCategories[id]}</span>
        </button>)}
      </div>
    </section>}
    <section id="offers" className="catalog-section">
      <div className="section-title"><div>{venue ? <h1>{selectedVenue.data?.name ?? 'Предложения заведения'}</h1> : <h2>Доступные предложения</h2>}
        <p className="muted">{venue ? selectedVenue.data?.address : 'Заберите заказ в удобное окно самовывоза'}</p></div>
        {venue ? <Link to="/" className="button secondary">Весь каталог</Link>
          : <Link to="/map" className="button secondary map-link"><MapPin size={18} /> На карте</Link>}
      </div>
      <div className="catalog-controls">
        <form className="search" onSubmit={find}><Search size={20} /><input aria-label="Поиск по названию" placeholder="Поиск по названию или заведению"
          value={search} onChange={(event) => { setSearch(event.target.value); if (!event.target.value) { submit(''); resetPage(); } }} />
          {search && <button className="icon-button clear-search" type="button" aria-label="Очистить поиск"
            onClick={() => { setSearch(''); submit(''); resetPage(); }}><X size={18} /></button>}
          <button className="button secondary search-submit" type="submit">Найти</button>
        </form>
        <button className="button secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
          <SlidersHorizontal size={18} /> Фильтры{filtersActive > 0 && <span className="count">{filtersActive}</span>}
        </button>
      </div>
      {filtersOpen && <div className="panel filters">
        <div className="field-grid">
          <label>Тип<select value={type} onChange={(event) => { setType(event.target.value); resetPage(); }}><option value="">Все</option><option value="SURPRISE_BOX">Сюрприз-боксы</option><option value="ITEM">Отдельные позиции</option></select></label>
          <label>Продукты<select value={category} onChange={(event) => { setCategory(event.target.value as OfferCategory | ''); resetPage(); }}><option value="">Все категории</option>
            {Object.entries(offerCategories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label>Заведение<select value={venue ?? ''} onChange={(event) => {
            setParams(event.target.value ? { venue: event.target.value } : {});
            setPagination({ venue: event.target.value || undefined, page: 1 });
          }}><option value="">Все заведения</option>
            {venue && !venues.data?.items.some(({ id }) => id === venue) && <option value={venue}>{selectedVenue.data?.name ?? 'Выбранное заведение'}</option>}
            {venues.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Цена от, ₽<input type="number" min={0} max={21474836} value={min} onChange={(event) => { setMin(event.target.value); resetPage(); }} /></label>
          <label>Цена до, ₽<input type="number" min={0} max={21474836} value={max} onChange={(event) => { setMax(event.target.value); resetPage(); }} /></label>
          <label>Расстояние<select value={radius} onChange={(event) => { setRadius(event.target.value); resetPage(); }}><option value="1">До 1 км</option><option value="3">До 3 км</option><option value="5">До 5 км</option><option value="10">До 10 км</option></select></label>
          <button className="button secondary align-end" disabled={locating} onClick={() => {
            setGeoError(''); setLocating(true); locate((point) => { setCoordinates(point); resetPage(); }, setGeoError, () => setLocating(false));
          }}><LocateFixed size={18} />{coordinates ? 'Обновить геопозицию' : 'Определить геопозицию'}</button>
        </div>
        {(venues.data?.hasMore || venueSearch) && <label>Найти заведение<input value={venueSearch} maxLength={120}
          onChange={(event) => setVenueSearch(event.target.value)} /></label>}
        {venues.error && <button className="button secondary self-start" onClick={venues.reload}>Повторить загрузку заведений</button>}
        {geoError && <Notice warning>{geoError}</Notice>}
        <fieldset className="check-field"><legend>Исключить аллергены</legend>
          {allergens.loading && <span className="muted">Загружаем аллергены…</span>}
          {allergens.error && <button className="button secondary" onClick={allergens.reload}>Повторить загрузку аллергенов</button>}
          {allergens.data?.map((allergen) => <label key={allergen.id}><input type="checkbox" checked={exclude.includes(allergen.id)} onChange={(event) => {
            setExclude(event.target.checked ? [...exclude, allergen.id] : exclude.filter((id) => id !== allergen.id)); resetPage();
          }} />{allergen.name}</label>)}
        </fieldset>
        <button className="button text-button" onClick={reset}>Сбросить фильтры</button>
      </div>}
      {!validPrices && <Notice warning>Минимальная цена должна быть меньше или равна максимальной.</Notice>}
      {matches.loading && <Loading />}
      {matches.error && <ErrorState error={matches.error} retry={matches.reload} />}
      {matches.data && (matches.data.items.length ? <div className="offer-grid">{matches.data.items.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</div>
        : <Empty title="Предложения не найдены" detail="Попробуйте изменить фильтры или заглянуть позже."><button className="button secondary" onClick={reset}>Сбросить фильтры</button></Empty>)}
      {matches.data && <Pagination page={activePage} hasMore={matches.data.hasMore} onChange={(page) => setPagination({ venue, page })} />}
    </section>
  </>;
}

export function OfferPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const cart = useCart();
  const offer = useResource<Offer>(id ? '/boxes/' + id : null, 'optional', session?.user.id);
  const venue = useResource<Venue>(offer.data ? '/establishments/' + offer.data.establishmentId : null);
  const [reviewPage, setReviewPage] = useState(1);
  const reviews = useResource<Page<Review>>(offer.data ? '/reviews' + queryString({ establishmentId: offer.data.establishmentId, limit: 5, page: reviewPage }) : null);
  const [quantity, setQuantity] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  if (offer.loading) return <Loading />;
  if (!offer.data) return <ErrorState error={offer.error ?? 'Предложение недоступно.'} retry={offer.reload} />;
  const item = offer.data;
  const addError = cart.validate(item, quantity);
  function add() {
    if (addError) { setError(addError); return; }
    cart.add(item, quantity); setAdded(true); setConfirm(false); setError('');
  }
  return <>
    <nav className="crumb"><Link to="/#offers">Каталог</Link><span> / </span>{item.name}</nav>
    <div className="detail-layout">
      <div className="detail-photo"><img src={offerPhoto(item)} alt="Иллюстрация категории предложения" /><span className="discount">−{item.discountPercent}%</span><FavoriteButton id={item.id} /></div>
      <div className="panel detail-info">
        <div className="eyeline">{item.establishment.name}</div><h1>{item.name}</h1>
        <div className="price large"><strong>{money(item.price)}</strong> {item.originalPrice > item.price && <del>{money(item.originalPrice)}</del>}</div>
        <p>{item.description || (item.type === 'SURPRISE_BOX' ? 'Состав бокса зависит от того, что сегодня осталось у заведения.' : offerCategories[item.category])}</p>
        <div className="stack compact"><Place>{item.establishment.address || 'Адрес уточняйте у заведения'}</Place>
          <span className="meta"><Timer size={17} />{pickupWindow(item.pickupStartsAt, item.pickupEndsAt)}</span></div>
        <div className="offer-tags">{item.size && <span className="chip">Размер {item.size}</span>}
          <span className="chip">≈ {item.weightGrams} г</span><span className="chip stock">Осталось {item.remainingQuantity}</span></div>
        {item.allergens.length > 0 && <div className="stack compact"><strong>Аллергены</strong><div className="tag-list">{item.allergens.map(({ id, name }) => <span key={id} className="chip">{name}</span>)}</div></div>}
        {item.containsUserAllergens && <Notice warning>В предложении есть аллергены из вашего профиля.</Notice>}
        {(item.type === 'SURPRISE_BOX' && item.allergens.length === 0) && <p className="muted">Уточните возможные аллергены у заведения.</p>}
        {session?.user.role !== 'ESTABLISHMENT' && <div className="row wrap">
          <label className="quantity-label">Количество<input aria-label="Количество порций" type="number" min={1} max={Math.min(item.remainingQuantity, 100)} value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.min(item.remainingQuantity, 100, Math.floor(Number(event.target.value)))))} /></label>
          <button className="button primary align-end" onClick={() => { if (addError) setError(addError); else if (item.containsUserAllergens) setConfirm(true); else add(); }}>
            <ShoppingBag size={18} /> В корзину</button>
        </div>}
        {error && <Notice warning>{error}</Notice>}
        {added && <div className="row wrap"><span role="status">Добавлено в корзину</span><Link className="button secondary" to="/cart">Перейти в корзину</Link></div>}
      </div>
    </div>
    <section className="subsection">
      <h2>Отзывы о заведении</h2>
      {venue.data?.rating != null && <p className="muted">★ {number(venue.data.rating)} · {venue.data.reviewCount} отзывов</p>}
      {reviews.loading && <Loading />}{reviews.error && <ErrorState error={reviews.error} retry={reviews.reload} />}
      {reviews.data?.items.length === 0 && <p className="muted">Отзывов пока нет.</p>}
      <div className="stack">{reviews.data?.items.map((review) => <article className="panel review" key={review.id}>
        <div className="row between"><strong>{review.customer.name}</strong><span>★ {review.rating} / 5</span></div>
        {review.comment && <p>{review.comment}</p>}<small className="muted">{shortDate(review.createdAt)}</small>
      </article>)}</div>
      {reviews.data && <Pagination page={reviewPage} hasMore={reviews.data.hasMore} onChange={setReviewPage} />}
    </section>
    {confirm && <Dialog title="Проверьте аллергены" onClose={() => setConfirm(false)}>
      <Notice warning>В предложении есть аллергены из вашего профиля. Проверьте состав перед заказом.</Notice>
      <div className="row end wrap"><button className="button secondary" onClick={() => setConfirm(false)}>Назад</button><button className="button primary" onClick={add}>Всё равно добавить</button></div>
    </Dialog>}
  </>;
}

export function FavoritesPage() {
  const favorites = useFavorites();
  useEffect(() => { favorites.reload(); }, [favorites.reload]);
  return <><PageTitle title="Избранное" detail="Доступные предложения, которые вы сохранили." />
    {favorites.loading && <Loading />}{favorites.error && <ErrorState error={favorites.error} retry={favorites.reload} />}
    {!favorites.loading && !favorites.error && (favorites.items.length
      ? <div className="offer-grid">{favorites.items.map((item) => <OfferCard key={item.id} offer={item} />)}</div>
      : <Empty title="Пока нет доступных предложений"><Link className="button primary" to="/#offers"><Leaf size={18} /> В каталог</Link></Empty>)}
    <Pagination page={favorites.page} hasMore={favorites.hasMore} onChange={favorites.setPage} />
  </>;
}
