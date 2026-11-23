import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from './api';
import { locate } from './Catalog';
import { money, number, queryString } from './format';
import { createLeafletMap, createYandexMap, kirov, loadYandexMaps, type Geo, type MapView } from './maps';
import type { MapPoint, Page } from './types';
import { Empty, ErrorState, Loading, Notice, PageTitle, Pagination, Place } from './ui';

const yandexKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim();

export default function MapPage() {
  const surface = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapView>();
  const [tileError, setTileError] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [geo, setGeo] = useState<Geo>();
  const [focus, setFocus] = useState<{ center: Geo; zoom: number }>({ center: kirov, zoom: 14 });
  const [radius, setRadius] = useState('5');
  const [page, setPage] = useState(1);
  const [selected, pick] = useState('');
  const [geoError, setGeoError] = useState('');
  const [locating, setLocating] = useState(false);
  const results = useResource<Page<MapPoint>>('/establishments/map' + queryString({
    lat: geo?.lat, lng: geo?.lng, radiusKm: geo ? radius : undefined, limit: 20, page,
  }));

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let active = true;
    let view: MapView | undefined;
    async function init(container: HTMLDivElement) {
      if (yandexKey) {
        try {
          const maps = await loadYandexMaps(yandexKey);
          if (!active) return;
          view = createYandexMap(container, maps);
        } catch {
          if (!active) return;
          setUsingFallback(true);
        }
      }
      view ??= createLeafletMap(container, setTileError);
      setMap(view);
    }
    void init(element);
    return () => { active = false; view?.destroy(); };
  }, []);

  useEffect(() => {
    map?.setPoints(results.data?.items ?? [], pick);
  }, [map, results.data]);
  useEffect(() => { map?.setUser(geo); }, [map, geo]);
  useEffect(() => { map?.focus(focus.center, focus.zoom); }, [map, focus]);

  return <>
    <PageTitle title="Карта" detail="Заведения с доступными предложениями в Кирове." action={<button className="button primary" disabled={locating}
      onClick={() => { setLocating(true); setGeoError(''); locate((point) => {
        setGeo(point); setFocus({ center: point, zoom: 14 }); setPage(1); pick('');
      }, setGeoError, () => setLocating(false)); }}>
      <LocateFixed size={18} />{locating ? 'Определяем…' : 'Моё местоположение'}</button>} />
    {geoError && <Notice warning>{geoError}</Notice>}
    <div className="map-layout">
      <div className="map-holder"><div ref={surface} className="map-surface" aria-label="Карта заведений" data-map-provider={map?.provider} />
        {!map && <div className="map-error" role="status">Загружаем карту…</div>}
        {map?.zoomBy && <div className="map-zoom">
          <button className="icon-button" aria-label="Приблизить карту" onClick={() => map.zoomBy?.(1)}><Plus size={18} /></button>
          <button className="icon-button" aria-label="Отдалить карту" onClick={() => map.zoomBy?.(-1)}><Minus size={18} /></button>
        </div>}
        {usingFallback && !tileError && <div className="map-error" role="status">Яндекс Карты недоступны. Показываем OpenStreetMap.</div>}
        {tileError && <div className="map-error">Подложка карты временно недоступна. Адреса есть в списке.</div>}
      </div>
      <aside className="panel map-sidebar">
        <div className="row between wrap"><h2>Заведения</h2>{geo && <label className="sr-only" htmlFor="map-radius">Радиус поиска</label>}
          {geo && <select id="map-radius" value={radius} onChange={(event) => { setRadius(event.target.value); setPage(1); pick(''); }}>
            <option value="1">1 км</option><option value="3">3 км</option><option value="5">5 км</option><option value="10">10 км</option><option value="100">100 км</option>
          </select>}</div>
        {geo && <button className="button text-button" onClick={() => { setGeo(undefined); setPage(1); pick(''); setFocus({ center: kirov, zoom: 14 }); }}>Показать весь Киров</button>}
        {results.loading && <Loading />}{results.error && <ErrorState error={results.error} retry={results.reload} />}
        {results.data?.items.length === 0 && <Empty title="Рядом нет предложений" detail="Увеличьте радиус или вернитесь к общей карте." />}
        <div className="stack">{results.data?.items.map((point) => <article className={`map-item ${selected === point.id ? 'selected' : ''}`} key={point.id}>
          <button className="map-point-name" onClick={() => {
            pick(point.id); setFocus({ center: { lat: point.latitude, lng: point.longitude }, zoom: 15 });
          }}><MapPin size={18} />{point.name}</button>
          {point.address && <Place>{point.address}</Place>}
          <p>{point.availableOffers} в наличии · от {money(point.minPrice)}{point.distanceKm === null ? '' : ` · ${number(point.distanceKm)} км`}</p>
          <Link className="text-link" to={`/?venue=${point.id}#offers`}>Смотреть предложения</Link>
        </article>)}</div>
        {results.data && <Pagination page={page} hasMore={results.data.hasMore} onChange={setPage} />}
      </aside>
    </div>
  </>;
}
