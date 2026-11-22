import type { Offer, OfferCategory, OrderStatus, VenueCategory } from './types';

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const timeZone = 'Europe/Kirov';
const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' });
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
export const money = (kopeks: number) => rub.format(kopeks / 100);
export const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
export const shortDate = (value: string) => date.format(new Date(value));
export function pickupWindow(start: string, end: string) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  const startDay = dayKey.format(startsAt);
  const day = startDay === dayKey.format(new Date()) ? 'Сегодня' : date.format(startsAt);
  if (startDay !== dayKey.format(endsAt)) return `${day}, ${clock.format(startsAt)} — ${date.format(endsAt)}, ${clock.format(endsAt)}`;
  return `${day}, ${clock.format(startsAt)}–${clock.format(endsAt)}`;
}

export const venueCategories: Record<VenueCategory, string> = {
  COFFEE_SHOP: 'Кофейни', BAKERY: 'Пекарни', RESTAURANT: 'Рестораны', STORE: 'Магазины',
};
export const offerCategories: Record<OfferCategory, string> = {
  BAKED_GOODS: 'Выпечка', DESSERTS: 'Десерты', PREPARED_MEALS: 'Готовые блюда', SALADS: 'Салаты', GROCERIES: 'Продукты',
};
export const statusLabels: Record<OrderStatus, string> = {
  RESERVED: 'Забронирован', PAID: 'Оплачен', READY: 'Готов к выдаче', COMPLETED: 'Выдан', CANCELLED: 'Отменён', EXPIRED: 'Бронь истекла',
};
export function offerPhoto(offer: Offer) {
  const images: Record<OfferCategory, string> = {
    BAKED_GOODS: 'bakery', DESSERTS: 'dessert', PREPARED_MEALS: 'lunch', SALADS: 'lunch', GROCERIES: 'produce',
  };
  return '/food/' + images[offer.category] + '.webp';
}

export function queryString(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? '?' + params : '';
}
