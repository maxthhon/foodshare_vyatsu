import { BarChart3, ClipboardList, Package, Plus, QrCode, ScanLine, Store, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, message, useResource } from './api';
import { SignOut } from './Customer';
import { money, offerCategories, pickupWindow, queryString, shortDate, statusLabels, venueCategories } from './format';
import { useAuth } from './state';
import type { Allergen, Analytics, Offer, OfferDetails, OfferType, Order, Page, Venue, VenueCategory } from './types';
import { Dialog, Empty, ErrorState, Loading, Notice, PageTitle, Pagination, Place, Status } from './ui';

const venueApi = '/establishments/me';
const tabs = [
  { to: '/business', label: 'Предложения', icon: Package },
  { to: '/business/orders', label: 'Заказы', icon: ClipboardList },
  { to: '/business/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/business/profile', label: 'Заведение', icon: Store },
];

export default function Business() {
  const { session } = useAuth();
  const venue = useResource<Venue>(venueApi, 'required', session?.user.id);
  return <>
    <PageTitle title="Кабинет заведения" detail={venue.data?.name} action={<SignOut />} />
    {venue.error && <ErrorState error={venue.error} retry={venue.reload} />}
    {venue.data?.status === 'PENDING' && <Notice>Заведение ожидает активации. Вы можете подготовить предложения и шаблоны.</Notice>}
    {venue.data?.status === 'SUSPENDED' && <Notice warning>Публикация заведения приостановлена.</Notice>}
    <nav className="business-tabs" aria-label="Кабинет заведения">{tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} end={to === '/business'} to={to}>
      <Icon size={18} />{label}</NavLink>)}</nav>
    <Routes>
      <Route index element={<Inventory />} />
      <Route path="orders" element={<BusinessOrders />} />
      <Route path="analytics" element={<BusinessAnalytics />} />
      <Route path="profile" element={venue.data ? <VenueForm key={venue.data.id} venue={venue.data} saved={venue.reload} /> : <Loading />} />
      <Route path="*" element={<Navigate to="/business" replace />} />
    </Routes>
  </>;
}

type Editor = { kind: 'offer'; item?: Offer } | { kind: 'template'; item?: OfferDetails } | { kind: 'publish'; item: OfferDetails };
type Removal = { target: OfferDetails; kind: 'offer' | 'template' };

function Inventory() {
  const { session } = useAuth();
  const [list, setList] = useState<'boxes' | 'templates'>('boxes');
  const [page, setPage] = useState(1);
  const [editor, edit] = useState<Editor>();
  const [removal, setRemoval] = useState<Removal>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const offers = useResource<Page<Offer>>(list === 'boxes' ? venueApi + '/boxes' + queryString({ page, limit: 10 }) : null,
    'required', session?.user.id);
  const templates = useResource<Page<OfferDetails>>(list === 'templates' ? venueApi + '/templates' + queryString({ page, limit: 10 }) : null,
    'required', session?.user.id);
  const resource = list === 'boxes' ? offers : templates;
  async function remove() {
    if (!removal) return;
    setDeleting(true); setError('');
    try {
      await api(venueApi + (removal.kind === 'offer' ? '/boxes/' : '/templates/') + removal.target.id, { mode: 'required', method: 'DELETE' });
      setRemoval(undefined); resource.reload();
    } catch (issue) { setError(message(issue)); }
    finally { setDeleting(false); }
  }
  function change(target: typeof list) { setList(target); setPage(1); setError(''); }
  return <section className="stack">
    <div className="row between wrap">
      <div className="segmented">
        <button className={list === 'boxes' ? 'selected' : ''} aria-pressed={list === 'boxes'} onClick={() => change('boxes')}>Предложения</button>
        <button className={list === 'templates' ? 'selected' : ''} aria-pressed={list === 'templates'} onClick={() => change('templates')}>Шаблоны</button>
      </div>
      <button className="button primary" onClick={() => edit({ kind: list === 'boxes' ? 'offer' : 'template' })}><Plus size={19} />
        {list === 'boxes' ? 'Добавить предложение' : 'Создать шаблон'}</button>
    </div>
    {resource.loading && <Loading />}{resource.error && <ErrorState error={resource.error} retry={resource.reload} />}
    {resource.data?.items.length === 0 && <Empty title={list === 'boxes' ? 'Предложений пока нет' : 'Шаблонов пока нет'} />}
    {offers.data?.items.map((offer) => <article className="panel order-row" key={offer.id}>
      <div className="stack compact"><h2>{offer.name}</h2>
        <p className="muted">{pickupWindow(offer.pickupStartsAt, offer.pickupEndsAt)}</p>
        <div className="tag-list"><span className="chip">Остаток {offer.remainingQuantity} / {offer.quantity}</span>
          {!offer.isAvailable && <span className="chip">Скрыто</span>}
          {Date.parse(offer.pickupEndsAt) <= Date.now() && <span className="chip">Слот закрыт</span>}</div>
      </div>
      <div className="row wrap"><strong>{money(offer.price)}</strong>
        <button className="button secondary" onClick={() => edit({ kind: 'offer', item: offer })}>Редактировать</button>
        <button className="icon-button" aria-label={`Архивировать: ${offer.name}`} onClick={() => { setError(''); setRemoval({ kind: 'offer', target: offer }); }}><Trash2 size={18} /></button>
      </div>
    </article>)}
    {templates.data?.items.map((item) => <article className="panel order-row" key={item.id}>
      <div><h2>{item.name}</h2><p className="muted">{offerCategories[item.category]} · {money(item.price)}</p></div>
      <div className="row wrap">
        <button className="button primary" onClick={() => edit({ kind: 'publish', item })}>Опубликовать</button>
        <button className="button secondary" onClick={() => edit({ kind: 'template', item })}>Редактировать</button>
        <button className="icon-button" aria-label={`Удалить: ${item.name}`} onClick={() => { setError(''); setRemoval({ kind: 'template', target: item }); }}><Trash2 size={18} /></button>
      </div>
    </article>)}
    {resource.data && <Pagination page={page} hasMore={resource.data.hasMore} onChange={setPage} />}
    {editor && <OfferEditor editor={editor} close={() => edit(undefined)} saved={() => {
      if (editor.kind === 'publish') change('boxes');
      else resource.reload();
      edit(undefined);
    }} />}
    {removal && <Dialog title={removal.kind === 'offer' ? 'Архивировать предложение?' : 'Удалить шаблон?'} onClose={() => { if (!deleting) setRemoval(undefined); }}>
      <p>{removal.target.name}</p>{error && <Notice warning>{error}</Notice>}
      <div className="row end wrap"><button className="button secondary" disabled={deleting} onClick={() => setRemoval(undefined)}>Отмена</button>
        <button className="button danger-button" disabled={deleting} onClick={() => void remove()}>Подтвердить</button></div>
    </Dialog>}
  </section>;
}

function kirovInput(value: string | number) {
  return new Date((typeof value === 'string' ? Date.parse(value) : value) + 3 * 3600000).toISOString().slice(0, 16);
}
const kirovIso = (value: string) => new Date(value + '+03:00').toISOString();

function OfferEditor({ editor, close, saved }: { editor: Editor; close: () => void; saved: () => void }) {
  const item = editor.item;
  const draft = editor.kind === 'offer' ? editor.item : undefined;
  const allergens = useResource<Allergen[]>(editor.kind !== 'publish' ? '/allergens' : null);
  const [type, setType] = useState<OfferType>(item?.type ?? 'SURPRISE_BOX');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const title = editor.kind === 'publish' ? 'Публикация из шаблона' : editor.kind === 'offer'
    ? item ? 'Редактировать предложение' : 'Новое предложение'
    : item ? 'Редактировать шаблон' : 'Новый шаблон';
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError('');
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    try {
      const quantity = Number(form.get('quantity'));
      const start = text('pickupStartsAt');
      const end = text('pickupEndsAt');
      const stock = editor.kind !== 'template' ? {
        quantity: draft?.quantity === quantity ? undefined : quantity,
        pickupStartsAt: draft && start === kirovInput(draft.pickupStartsAt) ? undefined : kirovIso(start),
        pickupEndsAt: draft && end === kirovInput(draft.pickupEndsAt) ? undefined : kirovIso(end),
        isAvailable: form.has('isAvailable'),
      } : {};
      const fields = editor.kind === 'publish' ? { templateId: editor.item.id } : {
        name: text('name'), description: text('description') || null, type,
        size: type === 'SURPRISE_BOX' ? text('size') : null,
        category: text('category'), price: Math.round(Number(form.get('price')) * 100),
        originalPrice: Math.round(Number(form.get('originalPrice')) * 100),
        weightGrams: Number(form.get('weightGrams')), allergenIds: form.getAll('allergens'),
      };
      const base = venueApi + (editor.kind === 'template' ? '/templates' : '/boxes');
      const updating = item && editor.kind !== 'publish';
      await api(updating ? base + '/' + item.id : base, { method: updating ? 'PATCH' : 'POST', mode: 'required', body: { ...fields, ...stock } });
      saved();
    } catch (issue) { setError(message(issue)); }
    finally { setPending(false); }
  }
  return <Dialog title={title} onClose={() => { if (!pending) close(); }}>
    <form className="form stack" onSubmit={(event) => void save(event)}>
      {editor.kind === 'publish' ? <p className="muted">{item?.name} · {item && money(item.price)}</p> : <>
        <label>Название<input required name="name" maxLength={120} defaultValue={item?.name} /></label>
        <label>Описание<textarea name="description" maxLength={2000} defaultValue={item?.description ?? ''} rows={2} /></label>
        <div className="field-grid">
          <label>Тип<select value={type} onChange={(event) => setType(event.target.value as OfferType)}><option value="SURPRISE_BOX">Сюрприз-бокс</option><option value="ITEM">Отдельная позиция</option></select></label>
          {type === 'SURPRISE_BOX' && <label>Размер<select name="size" defaultValue={item?.size ?? 'M'}><option>S</option><option>M</option><option>L</option></select></label>}
          <label>Категория<select name="category" defaultValue={item?.category ?? 'BAKED_GOODS'}>{Object.entries(offerCategories).map(([key, value]) =>
            <option key={key} value={key}>{value}</option>)}</select></label>
          <label>Обычная цена, ₽<input required type="number" min={0.01} max={100000} step={0.01} name="originalPrice" defaultValue={item && item.originalPrice / 100} /></label>
          <label>Цена со скидкой, ₽<input required type="number" min={0.01} max={100000} step={0.01} name="price" defaultValue={item && item.price / 100} /></label>
          <label>Вес, г<input required type="number" min={1} max={100000} name="weightGrams" defaultValue={item?.weightGrams} /></label>
        </div>
        <fieldset className="check-field"><legend>Аллергены</legend>
          {allergens.error && <button type="button" className="button secondary" onClick={allergens.reload}>Повторить загрузку</button>}
          {allergens.loading && <span className="muted">Загружаем…</span>}
          {allergens.data?.map(({ id, name }) => <label key={id}><input type="checkbox" name="allergens" value={id}
            defaultChecked={item?.allergens.some((tag) => tag.id === id)} />{name}</label>)}
        </fieldset>
      </>}
      {editor.kind !== 'template' && <>
        <div className="field-grid">
          <label>Количество<input required type="number" min={0} max={100000} name="quantity" defaultValue={draft?.quantity ?? 1} /></label>
          <label>Начало самовывоза<input required type="datetime-local" name="pickupStartsAt" defaultValue={kirovInput(draft?.pickupStartsAt ?? Date.now() + 3600000)} /></label>
          <label>Конец самовывоза<input required type="datetime-local" name="pickupEndsAt" defaultValue={kirovInput(draft?.pickupEndsAt ?? Date.now() + 10800000)} /></label>
        </div>
        <p className="muted">Время Кирова (UTC+3).</p>
        <label className="checkbox"><input type="checkbox" name="isAvailable" defaultChecked={draft?.isAvailable ?? true} />Показывать в каталоге</label>
      </>}
      {error && <Notice warning>{error}</Notice>}
      <div className="row end wrap"><button type="button" className="button secondary" disabled={pending} onClick={close}>Отмена</button>
        <button className="button primary" disabled={pending || (editor.kind !== 'publish' && !allergens.data)}>
          {pending ? 'Сохраняем…' : editor.kind === 'publish' ? 'Опубликовать' : 'Сохранить'}</button></div>
    </form>
  </Dialog>;
}

function VenueForm({ venue, saved }: { venue: Venue; saved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess(false); setPending(true);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    try {
      const opens = text('opens');
      const closes = text('closes');
      if (Boolean(opens) !== Boolean(closes)) { setError('Укажите оба времени работы.'); return; }
      const hours = { ...venue.businessHours };
      if (opens && closes) hours.daily = { opens, closes };
      else delete hours.daily;
      await api(venueApi, { method: 'PUT', mode: 'required', body: {
        name: text('name'), description: text('description') || null, address: text('address') || null,
        publicPhone: text('phone') || null, publicEmail: text('email') || null, logoUrl: text('logo') || null,
        latitude: text('latitude') ? Number(text('latitude')) : null, longitude: text('longitude') ? Number(text('longitude')) : null,
        categories: form.getAll('category'), businessHours: Object.keys(hours).length ? hours : null,
      } });
      setSuccess(true); saved();
    } catch (issue) { setError(message(issue)); }
    finally { setPending(false); }
  }
  return <form className="panel form stack" onSubmit={(event) => void submit(event)}>
    <h2>Профиль заведения</h2>
    <label>Название<input name="name" maxLength={120} required defaultValue={venue.name} /></label>
    <label>Описание<textarea name="description" maxLength={2000} rows={3} defaultValue={venue.description ?? ''} /></label>
    <div className="field-grid">
      <label>Адрес<input name="address" maxLength={250} defaultValue={venue.address ?? ''} /></label>
      <label>Ссылка на логотип<input name="logo" type="url" defaultValue={venue.logoUrl ?? ''} /></label>
      <label>Широта<input name="latitude" type="number" min={-90} max={90} step="any" defaultValue={venue.latitude ?? ''} /></label>
      <label>Долгота<input name="longitude" type="number" min={-180} max={180} step="any" defaultValue={venue.longitude ?? ''} /></label>
      <label>Телефон<input name="phone" type="tel" maxLength={40} defaultValue={venue.publicPhone ?? ''} /></label>
      <label>Электронная почта<input name="email" type="email" defaultValue={venue.publicEmail ?? ''} /></label>
      <label>Открытие (ежедневно)<input name="opens" type="time" defaultValue={venue.businessHours?.daily?.opens ?? ''} /></label>
      <label>Закрытие (ежедневно)<input name="closes" type="time" defaultValue={venue.businessHours?.daily?.closes ?? ''} /></label>
    </div>
    <fieldset className="check-field"><legend>Категории</legend>{Object.entries(venueCategories).map(([key, label]) =>
      <label key={key}><input type="checkbox" name="category" value={key} defaultChecked={venue.categories.includes(key as VenueCategory)} />{label}</label>)}</fieldset>
    {error && <Notice warning>{error}</Notice>}{success && <Notice>Профиль заведения обновлён.</Notice>}
    <button className="button primary self-start" disabled={pending}>Сохранить</button>
  </form>;
}

type Code = { orderId: string; qrToken: string };
const qrPattern = /^[A-Za-z0-9_-]{43}$/;
function decodePayload(value: string): Code | null {
  try {
    const data = JSON.parse(value);
    return typeof data.orderId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.orderId)
      && typeof data.qrToken === 'string' && qrPattern.test(data.qrToken) ? data : null;
  } catch { return null; }
}

function BusinessOrders() {
  const { session } = useAuth();
  const [filter, setFilter] = useState({ page: 1, status: '' });
  const orders = useResource<Page<Order>>(venueApi + '/orders' + queryString({ ...filter, limit: 10 }), 'required', session?.user.id);
  const [handoff, setHandoff] = useState<Order>();
  const [scanner, setScanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  async function update(orderId: string, action: 'ready' | 'confirm', body?: { pin: string } | { qrToken: string }) {
    setBusy(true); setError(''); setInfo('');
    try {
      await api(venueApi + '/orders/' + orderId + '/' + action, { method: 'POST', mode: 'required', body });
      setInfo(action === 'ready' ? 'Заказ готов к выдаче.' : 'Заказ выдан.'); setHandoff(undefined);
    } catch (issue) { setError(message(issue)); }
    finally { setBusy(false); orders.reload(); }
  }
  return <section className="stack">
    <div className="row between wrap">
      <label className="compact-field">Статус<select value={filter.status} onChange={(event) => setFilter({ page: 1, status: event.target.value })}>
        <option value="">Все заказы</option>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <button className="button primary" disabled={busy} onClick={() => { setError(''); setScanner(true); }}><ScanLine size={19} />Сканировать QR</button>
    </div>
    {info && <Notice>{info}</Notice>}{error && !handoff && <Notice warning>{error}</Notice>}
    {orders.loading && <Loading />}{orders.error && <ErrorState error={orders.error} retry={orders.reload} />}
    {orders.data?.items.length === 0 && <Empty title="Заказов по этому фильтру нет" />}
    {orders.data?.items.map((order) => <article className="panel order-row" key={order.id}>
      <div className="stack compact"><Status status={order.status} /><h2>Заказ {order.id.slice(0, 8).toUpperCase()}</h2>
        <p>{order.items.map((item) => item.offerName + ' × ' + item.quantity).join(', ')}</p>
        <p className="muted">{pickupWindow(order.pickupStartsAt, order.pickupEndsAt)}</p></div>
      <div className="row wrap"><strong>{money(order.totalAmount)}</strong>
        {order.status === 'PAID' && <button className="button primary" disabled={busy} onClick={() => void update(order.id, 'ready')}>Готов к выдаче</button>}
        {order.status === 'READY' && <button className="button primary" disabled={busy} onClick={() => { setError(''); setHandoff(order); }}>Выдать по коду</button>}
      </div>
    </article>)}
    {orders.data && <Pagination page={filter.page} hasMore={orders.data.hasMore} onChange={(page) => setFilter({ ...filter, page })} />}
    {handoff && <Dialog title="Подтвердить выдачу" onClose={() => { if (!busy) { setHandoff(undefined); setError(''); } }}>
      <form className="form stack" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = String(form.get('code')).trim();
        const payload = decodePayload(value);
        if (payload && payload.orderId !== handoff.id) { setError('Этот QR-код относится к другому заказу.'); return; }
        const qrToken = payload?.qrToken ?? value;
        if (/^\d{4}$/.test(value)) void update(handoff.id, 'confirm', { pin: value });
        else if (qrPattern.test(qrToken)) void update(handoff.id, 'confirm', { qrToken });
        else setError('Введите четырёхзначный ПИН или QR-токен.');
      }}>
        <label>ПИН или QR-токен<input name="code" required autoComplete="off" maxLength={160} /></label>
        {error && <Notice warning>{error}</Notice>}
        <button className="button primary" disabled={busy}>Подтвердить выдачу</button>
      </form>
    </Dialog>}
    {scanner && <Scanner close={() => setScanner(false)} decoded={(value) => {
      setScanner(false);
      const code = decodePayload(value);
      if (!code) { setError('В QR-коде нет заказа FoodShare.'); return; }
      void update(code.orderId, 'confirm', { qrToken: code.qrToken });
    }} />}
  </section>;
}

function Scanner({ close, decoded }: { close: () => void; decoded: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const decodedRef = useRef(decoded);
  decodedRef.current = decoded;
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!camera) return;
    let active = true;
    let stop: (() => void) | undefined;
    void import('@zxing/browser').then(async ({ BrowserQRCodeReader }) => {
      if (!active || !video.current) return;
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current,
        (result, _issue, current) => {
          if (!active || !result) return;
          active = false;
          current.stop();
          decodedRef.current(result.getText());
        });
      stop = () => controls.stop();
      if (!active) stop();
    }).catch(() => { if (active) { setError('Камера недоступна. Выберите изображение QR или введите ПИН в заказе.'); setCamera(false); } });
    return () => { active = false; stop?.(); };
  }, [camera]);
  async function scanFile(file?: File) {
    if (!file) return;
    setReading(true); setError(''); setCamera(false);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      decodedRef.current(result.getText());
    } catch { setError('На изображении не удалось прочитать QR-код.'); }
    finally { URL.revokeObjectURL(url); setReading(false); }
  }
  return <Dialog title="Сканировать QR" onClose={close}>
    {camera && <video ref={video} autoPlay muted playsInline className="camera-preview" aria-label="Изображение с камеры" />}
    {error && <Notice warning>{error}</Notice>}
    {!camera && <button className="button primary" disabled={reading} onClick={() => { setError(''); setCamera(true); }}><QrCode size={19} /> Включить камеру</button>}
    <label className="file-label">Или загрузите изображение<input type="file" accept="image/*" disabled={reading}
      onChange={(event) => void scanFile(event.target.files?.[0])} /></label>
  </Dialog>;
}

function BusinessAnalytics() {
  const { session } = useAuth();
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const data = useResource<Analytics>(venueApi + '/analytics' + queryString(range), 'required', session?.user.id);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setRange({ from: String(form.get('from')) || undefined, to: String(form.get('to')) || undefined });
  }
  const stats = data.data;
  const metrics = [
    ['Продано боксов', stats?.totals.soldBoxes], ['Продано позиций', stats?.totals.soldUnits], ['Непродано позиций', stats?.totals.unsoldUnits],
    ['Выручка', stats && money(stats.totals.grossRevenue)], ['Комиссия', stats && money(stats.totals.commission)],
    ['После комиссии', stats && money(stats.totals.netRevenue)],
  ];
  const highest = Math.max(1, ...(stats?.daily.map((item) => item.grossRevenue) ?? []));
  return <section className="stack">
    <form className="row wrap" onSubmit={filter}>
      <label className="compact-field">С даты<input type="date" name="from" defaultValue={range.from} /></label>
      <label className="compact-field">По дату<input type="date" name="to" defaultValue={range.to} /></label>
      <button className="button secondary align-end">Показать</button>
    </form>
    {data.loading && <Loading />}{data.error && <ErrorState error={data.error} retry={data.reload} />}
    {stats && <>
      <div className="metric-grid">{metrics.map(([label, value]) => <article key={label} className="panel metric"><span>{label}</span><strong>{value}</strong></article>)}</div>
      <div className="panel stack"><h2>Продажи по дням</h2>
        <div className="revenue-bars" aria-hidden="true">{stats.daily.map((day) => <div key={day.date} title={`${day.date}: ${money(day.grossRevenue)}`}
          style={{ height: `${Math.max(day.grossRevenue / highest * 100, 1)}%` }} />)}</div>
        <div className="table-scroll"><table><caption className="sr-only">Продажи за выбранный период</caption><thead><tr><th>День</th><th>Заказы</th><th>Продано</th><th>Непродано</th><th>Выручка</th></tr></thead>
          <tbody>{stats.daily.map((day) => <tr key={day.date}><th scope="row">{shortDate(day.date + 'T12:00:00+03:00')}</th>
            <td>{day.completedOrders}</td><td>{day.soldUnits}</td><td>{day.unsoldUnits}</td><td>{money(day.grossRevenue)}</td></tr>)}</tbody></table></div>
      </div>
    </>}
  </section>;
}
