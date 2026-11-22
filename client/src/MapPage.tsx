import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from './api';
import { locate } from './Catalog';
import { money, number, queryString } from './format';
import type { MapPoint, Page } from './types';
import { Empty, ErrorState, Loading, Notice, PageTitle, Pagination, Place } from './ui';

const kirov: L.LatLngExpression = [58.6036, 49.6680];
const pin = L.divIcon({ className: 'leaflet-food-pin', html: '<span></span>', iconSize: [32, 38], iconAnchor: [16, 36] });
type Geo = { lat: number; lng: number };

export default function MapPage() {
  const surface = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pointsLayer = useRef<L.LayerGroup | null>(null);
  const userLayer = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  const [geo, setGeo] = useState<Geo>();
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
    const view = L.map(element, { scrollWheelZoom: false }).setView(kirov, 14);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(view);
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('load', () => {
      if (element.querySelector('.leaflet-tile-loaded')) setTileError(false);
    });
    map.current = view;
    pointsLayer.current = L.layerGroup().addTo(view);
    userLayer.current = L.layerGroup().addTo(view);
    const observer = new ResizeObserver(() => view.invalidateSize());
    observer.observe(element);
    return () => { observer.disconnect(); view.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const layer = pointsLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const point of results.data?.items ?? []) {
      L.marker([point.latitude, point.longitude], { icon: pin, title: point.name, alt: point.name })
        .on('click', () => pick(point.id)).addTo(layer);
    }
  }, [results.data]);

  useEffect(() => {
    userLayer.current?.clearLayers();
    if (!geo || !userLayer.current) return;
    L.circleMarker([geo.lat, geo.lng], { radius: 8, color: '#fff', fillColor: '#235aa8', opacity: 1, fillOpacity: 1 })
      .addTo(userLayer.current);
    map.current?.setView([geo.lat, geo.lng], 14);
  }, [geo]);

  function focus(point: MapPoint) {
    pick(point.id); map.current?.setView([point.latitude, point.longitude], 15);
  }

  return <>
    <PageTitle title="Карта" detail="Заведения с доступными предложениями в Кирове." action={<button className="button primary" disabled={locating}
      onClick={() => { setLocating(true); setGeoError(''); locate((point) => { setGeo(point); setPage(1); pick(''); }, setGeoError, () => setLocating(false)); }}>
      <LocateFixed size={18} />{locating ? 'Определяем…' : 'Моё местоположение'}</button>} />
    {geoError && <Notice warning>{geoError}</Notice>}
    <div className="map-layout">
      <div className="map-holder"><div ref={surface} className="map-surface" aria-label="Карта заведений" />
        {tileError && <div className="map-error">Подложка карты временно недоступна. Адреса есть в списке.</div>}
      </div>
      <aside className="panel map-sidebar">
        <div className="row between wrap"><h2>Заведения</h2>{geo && <label className="sr-only" htmlFor="map-radius">Радиус поиска</label>}
          {geo && <select id="map-radius" value={radius} onChange={(event) => { setRadius(event.target.value); setPage(1); pick(''); }}>
            <option value="1">1 км</option><option value="3">3 км</option><option value="5">5 км</option><option value="10">10 км</option><option value="100">100 км</option>
          </select>}</div>
        {geo && <button className="button text-button" onClick={() => { setGeo(undefined); setPage(1); pick(''); map.current?.setView(kirov, 14); }}>Показать весь Киров</button>}
        {results.loading && <Loading />}{results.error && <ErrorState error={results.error} retry={results.reload} />}
        {results.data?.items.length === 0 && <Empty title="Рядом нет предложений" detail="Увеличьте радиус или вернитесь к общей карте." />}
        <div className="stack">{results.data?.items.map((point) => <article className={`map-item ${selected === point.id ? 'selected' : ''}`} key={point.id}>
          <button className="map-point-name" onClick={() => focus(point)}><MapPin size={18} />{point.name}</button>
          {point.address && <Place>{point.address}</Place>}
          <p>{point.availableOffers} в наличии · от {money(point.minPrice)}{point.distanceKm === null ? '' : ` · ${number(point.distanceKm)} км`}</p>
          <Link className="text-link" to={`/?venue=${point.id}#offers`}>Смотреть предложения</Link>
        </article>)}</div>
        {results.data && <Pagination page={page} hasMore={results.data.hasMore} onChange={setPage} />}
      </aside>
    </div>
  </>;
}
