import type * as Yandex from '@yandex/ymaps3-types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from './types';

export type Geo = { lat: number; lng: number };
export const kirov: Geo = { lat: 58.6036, lng: 49.6680 };
export type MapView = {
  provider: 'leaflet' | 'yandex';
  focus(point: Geo, zoom: number): void;
  setPoints(points: MapPoint[], select: (id: string) => void): void;
  setUser(point?: Geo): void;
  zoomBy?(delta: number): void;
  destroy(): void;
};

declare global {
  interface Window { ymaps3?: typeof Yandex }
}

let yandexLoader: Promise<typeof Yandex> | undefined;

export function loadYandexMaps(apiKey: string) {
  if (!yandexLoader) {
    yandexLoader = new Promise<typeof Yandex>((resolve, reject) => {
      const url = new URL('https://api-maps.yandex.ru/v3/');
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('lang', 'ru_RU');
      const script = document.createElement('script');
      script.src = url.href;
      script.async = true;
      const fail = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error('Yandex Maps API unavailable'));
      };
      const timeout = window.setTimeout(fail, 10_000);
      script.onerror = fail;
      script.onload = async () => {
        try {
          const maps = window.ymaps3;
          if (!maps) { fail(); return; }
          await maps.ready;
          window.clearTimeout(timeout);
          resolve(maps);
        } catch {
          fail();
        }
      };
      document.head.appendChild(script);
    }).catch((error) => {
      yandexLoader = undefined;
      throw error;
    });
  }
  return yandexLoader;
}

const leafletCoordinates = ({ lat, lng }: Geo): L.LatLngTuple => [lat, lng];
// Yandex uses longitude first, unlike Leaflet and the FoodShare API.
const yandexCoordinates = ({ lat, lng }: Geo): Yandex.LngLat => [lng, lat];
const leafletPin = L.divIcon({
  className: 'leaflet-food-pin', html: '<span></span>', iconSize: [32, 38], iconAnchor: [16, 36],
});

export function createLeafletMap(element: HTMLElement, reportTileError: (failed: boolean) => void): MapView {
  const map = L.map(element, { scrollWheelZoom: false }).setView(leafletCoordinates(kirov), 14);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  tiles.on('tileerror', () => reportTileError(true));
  tiles.on('load', () => {
    if (element.querySelector('.leaflet-tile-loaded')) reportTileError(false);
  });
  const markers = L.layerGroup().addTo(map);
  const user = L.layerGroup().addTo(map);
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(element);

  return {
    provider: 'leaflet',
    focus(point, zoom) { map.setView(leafletCoordinates(point), zoom); },
    setPoints(points, select) {
      markers.clearLayers();
      for (const point of points) {
        L.marker([point.latitude, point.longitude], { icon: leafletPin, title: point.name, alt: point.name })
          .on('click', () => select(point.id)).addTo(markers);
      }
    },
    setUser(point) {
      user.clearLayers();
      if (point) L.circleMarker(leafletCoordinates(point), {
        radius: 8, color: '#fff', fillColor: '#235aa8', fillOpacity: 1,
      }).addTo(user);
    },
    destroy() { observer.disconnect(); map.remove(); },
  };
}

export function createYandexMap(element: HTMLElement, maps: typeof Yandex): MapView {
  const map = new maps.YMap(element, {
    location: { center: yandexCoordinates(kirov), zoom: 14 },
    behaviors: ['drag', 'pinchZoom', 'dblClick'],
  });
  try {
    map.addChild(new maps.YMapDefaultSchemeLayer({})).addChild(new maps.YMapDefaultFeaturesLayer({}));
  } catch (error) {
    map.destroy();
    throw error;
  }
  let markers: Yandex.YMapMarker[] = [];
  let user: Yandex.YMapMarker | undefined;

  return {
    provider: 'yandex',
    focus(point, zoom) { map.setLocation({ center: yandexCoordinates(point), zoom }); },
    zoomBy(delta) {
      map.setLocation({ zoom: Math.min(map.zoomRange.max, Math.max(map.zoomRange.min, map.zoom + delta)) });
    },
    setPoints(points, select) {
      for (const marker of markers) map.removeChild(marker);
      markers = points.map((point) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'yandex-food-pin';
        button.append(document.createElement('span'));
        button.title = point.name;
        button.setAttribute('aria-label', point.name);
        button.addEventListener('click', () => select(point.id));
        const marker = new maps.YMapMarker({ coordinates: [point.longitude, point.latitude] }, button);
        map.addChild(marker);
        return marker;
      });
    },
    setUser(point) {
      if (user) map.removeChild(user);
      user = undefined;
      if (!point) return;
      const dot = document.createElement('div');
      dot.className = 'yandex-user-dot';
      user = new maps.YMapMarker({ coordinates: yandexCoordinates(point) }, dot);
      map.addChild(user);
    },
    destroy() { map.destroy(); },
  };
}
