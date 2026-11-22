import { Clock3, CreditCard, Leaf, LogOut, Minus, Plus, ShoppingBag, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, authenticate, logout, message, useResource } from './api';
import { money, number, offerPhoto, pickupWindow, queryString, shortDate, statusLabels } from './format';
import { useAuth, useCart } from './state';
import type { Allergen, Impact, Offer, Order, OrderStatus, Page, Payment, Profile, Role } from './types';
import { Dialog, Empty, ErrorState, Loading, Notice, PageTitle, Pagination, Place, Status } from './ui';

export function AuthPage() {
  const { session, ready } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [kind, setKind] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const intended = location.state?.from as unknown;
  const next = typeof intended === 'string' && intended.startsWith('/') && !intended.startsWith('//') && !intended.startsWith('/auth') ? intended : '/profile';
  if (ready && session) return <Navigate to={session.user.role === 'ESTABLISHMENT' ? '/business' : next} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError('');
    const form = new FormData(event.currentTarget);
    const credentials = { email: form.get('email'), password: form.get('password') };
    const body = kind === 'login' ? credentials : {
      ...credentials, name: form.get('name'), role,
      establishmentName: role === 'ESTABLISHMENT' ? form.get('establishmentName') : undefined,
    };
    try {
      const user = await authenticate(kind, body);
      navigate(user.role === 'ESTABLISHMENT' ? '/business' : next, { replace: true });
    } catch (issue) { setError(message(issue)); }
    finally { setPending(false); }
  }
  return <section className="auth-layout">
    <div className="auth-photo"><img src="/food/hero.webp" alt="" /></div>
    <div className="panel auth-form">
      <div className="segmented" aria-label="Действие с аккаунтом">
        <button className={kind === 'login' ? 'selected' : ''} aria-pressed={kind === 'login'} onClick={() => { setKind('login'); setError(''); }}>Вход</button>
        <button className={kind === 'register' ? 'selected' : ''} aria-pressed={kind === 'register'} onClick={() => { setKind('register'); setError(''); }}>Регистрация</button>
      </div>
      <h1>{kind === 'login' ? 'Войти в FoodShare' : 'Создать аккаунт'}</h1>
      <form className="stack form" onSubmit={(event) => void submit(event)}>
        {kind === 'register' && <>
          <label>Тип аккаунта<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="CUSTOMER">Покупатель</option><option value="ESTABLISHMENT">Заведение</option></select></label>
          <label>Имя<input name="name" autoComplete="name" maxLength={80} required /></label>
          {role === 'ESTABLISHMENT' && <label>Название заведения<input name="establishmentName" maxLength={120} required /></label>}
        </>}
        <label>Электронная почта<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Пароль<input name="password" type="password" autoComplete={kind === 'register' ? 'new-password' : 'current-password'}
          minLength={kind === 'register' ? 8 : 1} maxLength={72} required /></label>
        {error && <Notice warning>{error}</Notice>}
        <button className="button primary" type="submit" disabled={!ready || pending}>{pending ? 'Подождите…' : kind === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <Link className="text-link" to="/#offers">Продолжить без входа</Link>
      </form>
    </div>
  </section>;
}

export function CartPage() {
  const cart = useCart();
  const { ready, session } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function reserve(accepted = false) {
    if (!session) { navigate('/auth', { state: { from: '/cart' } }); return; }
    setError(''); setBusy(true);
    try {
      if (cart.attemptedFor !== session.user.id) {
        const latest = await Promise.all(cart.lines.map(({ offer }) => api<Offer>('/boxes/' + offer.id, { mode: 'optional' })));
        const allergens = latest.filter((offer) => offer.containsUserAllergens).map((offer) => offer.name);
        if (!accepted && allergens.length) { setWarning(allergens); return; }
        cart.beginReservation(session.user.id);
      }
      const result = await api<Order>('/orders', {
        method: 'POST', mode: 'required', key: cart.key,
        body: { items: cart.lines.map(({ offer, quantity }) => ({ offerId: offer.id, quantity })) },
      });
      cart.clear();
      navigate('/orders/' + result.id);
    } catch (issue) { setError(message(issue)); }
    finally { setBusy(false); }
  }
  if (!cart.lines.length) return <><PageTitle title="Корзина" /><Empty title="Корзина пока пуста">
    <Link to="/#offers" className="button primary">Смотреть предложения</Link></Empty></>;
  const starts = new Date(Math.max(...cart.lines.map(({ offer }) => Date.parse(offer.pickupStartsAt)))).toISOString();
  const ends = new Date(Math.min(...cart.lines.map(({ offer }) => Date.parse(offer.pickupEndsAt)))).toISOString();
  return <>
    <PageTitle title="Корзина" detail={cart.lines[0].offer.establishment.name} />
    <div className="checkout-layout">
      <div className="stack">
        {cart.lines.map(({ offer, quantity }) => <article className="panel cart-line" key={offer.id}>
          <img src={offerPhoto(offer)} alt="" /><div><Link className="text-link" to={`/offers/${offer.id}`}>{offer.name}</Link>
            <p className="muted">{money(offer.price)} за порцию</p></div>
          <div className="row cart-actions">
            <button className="icon-button" aria-label={`Уменьшить количество: ${offer.name}`} disabled={busy || quantity === 1} onClick={() => cart.setQuantity(offer.id, quantity - 1)}><Minus size={18} /></button>
            <strong>{quantity}</strong>
            <button className="icon-button" aria-label={`Увеличить количество: ${offer.name}`} disabled={busy || quantity >= Math.min(offer.remainingQuantity, 100)}
              onClick={() => cart.setQuantity(offer.id, quantity + 1)}><Plus size={18} /></button>
            <button className="icon-button" aria-label={`Удалить: ${offer.name}`} disabled={busy} onClick={() => cart.setQuantity(offer.id, 0)}><Trash2 size={18} /></button>
          </div>
        </article>)}
      </div>
      <aside className="panel summary stack">
        <h2>Самовывоз</h2><Place>{cart.lines[0].offer.establishment.address || 'Адрес уточняйте у заведения'}</Place>
        <span className="meta"><Clock3 size={18} />{pickupWindow(starts, ends)}</span>
        <div className="row between"><span>Итого</span><strong className="summary-total">{money(cart.total)}</strong></div>
        {error && <Notice warning>{error}</Notice>}
        {session?.user.role === 'ESTABLISHMENT' ? <Notice warning>Оформление доступно с аккаунта покупателя.</Notice>
          : <button className="button primary" onClick={() => void reserve()} disabled={!ready || busy}>
            <ShoppingBag size={18} />{busy ? 'Оформляем…' : session ? 'Забронировать' : 'Войти и забронировать'}</button>}
      </aside>
    </div>
    {warning.length > 0 && <Dialog title="В корзине есть аллергены" onClose={() => setWarning([])}>
      <Notice warning>{warning.join(', ')}</Notice>
      <div className="row end wrap"><button className="button secondary" onClick={() => setWarning([])}>Проверить корзину</button>
        <button className="button primary" onClick={() => { setWarning([]); void reserve(true); }}>Продолжить бронирование</button></div>
    </Dialog>}
  </>;
}

export function OrdersPage() {
  const { session } = useAuth();
  const [state, setState] = useState({ page: 1, status: '' });
  const orders = useResource<Page<Order>>('/orders' + queryString({ ...state, limit: 10 }), 'required', session?.user.id);
  return <><PageTitle title="Заказы" action={<label className="compact-field">Статус<select value={state.status}
    onChange={(event) => setState({ page: 1, status: event.target.value })}><option value="">Все заказы</option>
    {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>} />
    {orders.loading && <Loading />}{orders.error && <ErrorState error={orders.error} retry={orders.reload} />}
    {orders.data?.items.length === 0 && <Empty title="Заказов пока нет"><Link className="button primary" to="/#offers">В каталог</Link></Empty>}
    <div className="stack">{orders.data?.items.map((order) => <article className="panel order-row" key={order.id}>
      <div className="stack compact"><Status status={order.status} /><h2>{order.establishment.name}</h2><p className="muted">{shortDate(order.createdAt)} · {order.items.map((item) => item.offerName).join(', ')}</p></div>
      <div className="row wrap"><strong>{money(order.totalAmount)}</strong><Link to={`/orders/${order.id}`} className="button secondary">Подробнее</Link></div>
    </article>)}</div>
    {orders.data && <Pagination page={state.page} hasMore={orders.data.hasMore} onChange={(page) => setState({ ...state, page })} />}
  </>;
}

function PickupCode({ order }: { order: Order }) {
  const [image, setImage] = useState<string>();
  const token = order.pickup?.qrToken;
  useEffect(() => {
    if (!token) return;
    let active = true;
    void import('qrcode').then(({ toDataURL }) => toDataURL(JSON.stringify({ orderId: order.id, qrToken: token }),
      { width: 216, margin: 2, errorCorrectionLevel: 'M' })).then((url) => { if (active) setImage(url); }).catch(() => {});
    return () => { active = false; };
  }, [token, order.id]);
  if (!order.pickup) return null;
  return <div className="pickup-card"><div><h2>Код выдачи</h2><p>Покажите QR или назовите ПИН при самовывозе.</p>
    <strong className="pin-code">{order.pickup.pin}</strong></div>{image && <img src={image} alt="QR-код для подтверждения выдачи" />}</div>;
}

export function OrderPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const order = useResource<Order>(id ? '/orders/' + id : null, 'required', session?.user.id);
  const payments = useResource<Page<Payment>>(id ? '/orders/' + id + '/payments?limit=10' : null, 'required', session?.user.id);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lastStatus, setLastStatus] = useState<OrderStatus>();
  const keys = useRef<{ success?: string; failure?: string }>({});
  const stored = order.data;
  const status = stored?.status;
  useEffect(() => {
    if (status !== 'RESERVED' && status !== 'PAID' && status !== 'READY') return;
    const timeout = window.setInterval(order.reload, 4000);
    return () => window.clearInterval(timeout);
  }, [status, order.reload]);
  useEffect(() => {
    if (status !== 'RESERVED') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);
  if (order.loading) return <Loading />;
  if (!stored) return <ErrorState error={order.error ?? 'Заказ недоступен.'} retry={order.reload} />;
  const remaining = Math.max(0, Math.ceil((Date.parse(stored.expiresAt) - now) / 1000));
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const shownStatus = lastStatus === 'PAID' && status === 'RESERVED' ? lastStatus : status!;
  async function action(kind: 'cancel' | 'success' | 'failure') {
    setBusy(true); setError(''); setInfo(''); setCancelOpen(false);
    try {
      if (kind === 'cancel') {
        await api('/orders/' + id + '/cancel', { method: 'POST', mode: 'required' });
        setInfo('Заказ отменён.');
      } else {
        const key = keys.current[kind] ?? (keys.current[kind] = crypto.randomUUID());
        const result = await api<{ orderStatus: OrderStatus; payment: Payment }>('/orders/' + id + '/payments', {
          method: 'POST', mode: 'required', key, body: { outcome: kind },
        });
        delete keys.current[kind];
        setLastStatus(result.orderStatus);
        setInfo(result.payment.status === 'FAILED' ? 'Тестовая оплата отклонена. Можно повторить попытку до конца брони.' : 'Тестовая оплата прошла.');
      }
    } catch (issue) { setError(message(issue)); }
    finally { order.reload(); payments.reload(); setBusy(false); }
  }
  return <>
    <nav className="crumb"><Link to="/orders">Заказы</Link><span> / </span>Заказ {stored.id.slice(0, 8).toUpperCase()}</nav>
    <PageTitle title={stored.establishment.name} action={<Status status={shownStatus} />} />
    <div className="checkout-layout">
      <div className="stack">
        <section className="panel stack"><h2>Состав заказа</h2>
          {stored.items.map((item) => <div className="row between" key={item.offerId}><span>{item.offerName} × {item.quantity}</span><strong>{money(item.unitPrice * item.quantity)}</strong></div>)}
          <div className="row between summary-divider"><strong>Итого</strong><strong className="summary-total">{money(stored.totalAmount)}</strong></div>
        </section>
        {stored.pickup && <PickupCode order={stored} />}
        {shownStatus === 'COMPLETED' && <ReviewForm orderId={stored.id} />}
      </div>
      <aside className="panel stack summary">
        <h2>Самовывоз</h2><Place>{stored.establishment.address ?? 'Адрес уточняйте у заведения'}</Place>
        <span className="meta"><Clock3 size={18} />{pickupWindow(stored.pickupStartsAt, stored.pickupEndsAt)}</span>
        {shownStatus === 'RESERVED' && <div className="reservation-time"><Clock3 size={20} /><span>{remaining > 0 ? 'До конца брони' : 'Время брони истекло'}</span><strong>{countdown}</strong></div>}
        {shownStatus === 'RESERVED' && remaining > 0 && <>
          <button className="button primary" disabled={busy} onClick={() => void action('success')}><CreditCard size={18} /> Оплатить {money(stored.totalAmount)}</button>
          <button className="button secondary" disabled={busy} onClick={() => void action('failure')}>Проверить отказ оплаты</button>
          <p className="muted">Тестовый режим. Деньги не списываются.</p>
        </>}
        {(shownStatus === 'RESERVED' || shownStatus === 'PAID') && <button className="button text-button danger" disabled={busy} onClick={() => setCancelOpen(true)}>Отменить заказ</button>}
        {error && <Notice warning>{error}</Notice>}{info && <Notice>{info}</Notice>}
        {payments.data && payments.data.items.length > 0 && <details className="payment-history"><summary>История оплаты</summary>
          {payments.data.items.map((payment) => <div className="row between" key={payment.id}><span>{({
            SUCCEEDED: 'Оплачено', FAILED: 'Отклонено', REFUNDED: 'Возврат', PENDING: 'Ожидает',
          })[payment.status]}</span><strong>{money(payment.amount)}</strong></div>)}</details>}
      </aside>
    </div>
    {cancelOpen && <Dialog title="Отменить заказ?" onClose={() => setCancelOpen(false)}>
      <p>{shownStatus === 'PAID' ? 'Тестовая оплата будет возвращена.' : 'Забронированные позиции вернутся в каталог.'}</p>
      <div className="row end wrap"><button className="button secondary" onClick={() => setCancelOpen(false)}>Оставить заказ</button>
        <button className="button danger-button" onClick={() => void action('cancel')}>Подтвердить отмену</button></div></Dialog>}
  </>;
}

function ReviewForm({ orderId }: { orderId: string }) {
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/reviews', { method: 'POST', mode: 'required', body: {
        orderId, rating: Number(form.get('rating')), comment: String(form.get('comment')).trim() || undefined,
      } });
      setSaved(true);
    } catch (issue) { setError(message(issue)); }
    finally { setBusy(false); }
  }
  return <section className="panel stack"><h2>Отзыв о заказе</h2>
    {saved ? <Notice>Отзыв опубликован.</Notice> : <form className="form stack" onSubmit={(event) => void post(event)}>
      <label>Оценка<select name="rating" defaultValue={5}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} из 5</option>)}</select></label>
      <label>Комментарий<textarea name="comment" maxLength={1000} rows={3} /></label>
      {error && <Notice warning>{error}</Notice>}
      <button className="button primary self-start" disabled={busy}>Опубликовать отзыв</button>
    </form>}</section>;
}

export function ProfilePage() {
  const { session } = useAuth();
  const profile = useResource<Profile>('/me', 'required', session?.user.id);
  const impact = useResource<Impact>('/me/impact', 'required', session?.user.id);
  const allergens = useResource<Allergen[]>('/allergens');
  return <>
    <PageTitle title="Мой профиль" action={<SignOut />} />
    <div className="checkout-layout">
      <div className="stack">
        {profile.loading && <Loading />}{profile.error && <ErrorState error={profile.error} retry={profile.reload} />}
        {profile.data && <ProfileForm key={profile.data.id} profile={profile.data} allergens={allergens.data}
          allergenError={allergens.error} retry={allergens.reload} />}
        <Link className="button secondary self-start" to="/orders">История заказов</Link>
      </div>
      <aside className="panel stack impact"><div className="category-icon mint"><Leaf size={24} /></div><h2>Ваш эко-вклад</h2>
        {impact.loading && <Loading />}{impact.error && <ErrorState error={impact.error} retry={impact.reload} />}
        {impact.data && <><div><strong>{number(impact.data.savedKg)} кг</strong><p>еды спасено</p></div>
          <div><strong>{number(impact.data.estimatedCo2Kg)} кг</strong><p>CO₂ удалось сэкономить, по оценке</p></div></>}
      </aside>
    </div>
  </>;
}

function ProfileForm({ profile, allergens, allergenError, retry }: {
  profile: Profile; allergens?: Allergen[]; allergenError?: string; retry: () => void;
}) {
  const [selected, setSelected] = useState(profile.allergens.map(({ id }) => id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      await api('/me', { method: 'PATCH', mode: 'required', body: { name: form.get('name'), allergenIds: selected } });
      setSaved(true);
    } catch (issue) { setError(message(issue)); }
    finally { setBusy(false); }
  }
  return <form className="panel form stack" onSubmit={(event) => void save(event)}>
    <h2 className="row"><UserRound size={20} /> Личные данные</h2>
    <label>Имя<input name="name" defaultValue={profile.name} maxLength={80} required /></label>
    <label>Почта<input value={profile.email} readOnly /></label>
    <fieldset className="check-field"><legend>Мои аллергены</legend>
      {allergenError && <button type="button" className="button secondary" onClick={retry}>Загрузить аллергены</button>}
      {!allergens && !allergenError && <span className="muted">Загружаем…</span>}
      {allergens?.map(({ id, name }) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) =>
        setSelected(event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))} />{name}</label>)}
    </fieldset>
    {error && <Notice warning>{error}</Notice>}{saved && <Notice>Профиль обновлён.</Notice>}
    <button className="button primary self-start" disabled={busy}>Сохранить</button>
  </form>;
}

export function SignOut() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <div className="stack compact"><button className="button secondary" disabled={pending} onClick={() => {
    setPending(true); setError(''); void logout().then(() => navigate('/', { replace: true }))
      .catch((issue: unknown) => setError(message(issue))).finally(() => setPending(false));
  }}><LogOut size={18} /> Выйти</button>{error && <Notice warning>{error}</Notice>}</div>;
}
