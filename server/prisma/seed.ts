import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import {
  EstablishmentCategory, EstablishmentStatus, OfferCategory, OfferSize, OfferType, PrismaClient, Role,
} from '../src/generated/prisma/client.js';

const allergens = [
  { id: 'gluten', name: 'Глютен' },
  { id: 'milk', name: 'Молоко' },
  { id: 'lactose', name: 'Лактоза' },
  { id: 'peanuts', name: 'Арахис' },
  { id: 'eggs', name: 'Яйца' },
  { id: 'soy', name: 'Соя' },
  { id: 'sesame', name: 'Кунжут' },
];

type DemoOffer = {
  name: string;
  size?: OfferSize;
  category: OfferCategory;
  priceRub: number;
  weightGrams: number;
  allergenIds: string[];
};

const venues: {
  name: string;
  category: EstablishmentCategory;
  position: [number, number];
  offers: DemoOffer[];
}[] = [
  {
    name: 'Кофейня «Тёплая чашка»',
    category: 'COFFEE_SHOP',
    position: [58.6047, 49.6654],
    offers: [
      { name: 'Бокс к кофе', size: 'S', category: 'DESSERTS', priceRub: 159, weightGrams: 300, allergenIds: ['gluten', 'milk', 'eggs'] },
      { name: 'Чизкейк', category: 'DESSERTS', priceRub: 129, weightGrams: 150, allergenIds: ['gluten', 'milk', 'lactose'] },
      { name: 'Шоколадное печенье', category: 'BAKED_GOODS', priceRub: 75, weightGrams: 100, allergenIds: ['gluten', 'peanuts'] },
    ],
  },
  {
    name: 'Пекарня «Вятская корочка»',
    category: 'BAKERY',
    position: [58.6008, 49.6732],
    offers: [
      { name: 'Бокс свежей выпечки', size: 'M', category: 'BAKED_GOODS', priceRub: 239, weightGrams: 500, allergenIds: ['gluten', 'eggs', 'milk'] },
      { name: 'Хлеб с кунжутом', category: 'BAKED_GOODS', priceRub: 99, weightGrams: 350, allergenIds: ['gluten', 'sesame'] },
      { name: 'Слойка с яблоком', category: 'BAKED_GOODS', priceRub: 85, weightGrams: 130, allergenIds: ['gluten', 'eggs'] },
    ],
  },
  {
    name: 'Кафе «На Спасской»',
    category: 'RESTAURANT',
    position: [58.6035, 49.6835],
    offers: [
      { name: 'Бокс готовых блюд', size: 'L', category: 'PREPARED_MEALS', priceRub: 379, weightGrams: 800, allergenIds: ['gluten', 'milk', 'soy'] },
      { name: 'Гречка с овощами', category: 'PREPARED_MEALS', priceRub: 139, weightGrams: 300, allergenIds: ['soy'] },
      { name: 'Салат из печёной свёклы', category: 'SALADS', priceRub: 115, weightGrams: 200, allergenIds: ['milk', 'lactose'] },
    ],
  },
  {
    name: 'Магазин «Запас на завтра»',
    category: 'STORE',
    position: [58.5958, 49.6625],
    offers: [
      { name: 'Бокс с фруктами', size: 'M', category: 'GROCERIES', priceRub: 199, weightGrams: 550, allergenIds: [] },
      { name: 'Овощной салат', category: 'SALADS', priceRub: 109, weightGrams: 200, allergenIds: ['sesame'] },
      { name: 'Сэндвич с сыром', category: 'PREPARED_MEALS', priceRub: 119, weightGrams: 180, allergenIds: ['gluten', 'milk', 'eggs'] },
    ],
  },
];

function demoId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function pickupWindow() {
  const now = new Date();
  const kirovDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Kirov', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const pickupStartsAt = new Date(`${kirovDate}T18:00:00+03:00`);
  if (pickupStartsAt.getTime() - now.getTime() < 30 * 60 * 1000) {
    pickupStartsAt.setUTCDate(pickupStartsAt.getUTCDate() + 1);
  }
  const pickupEndsAt = new Date(pickupStartsAt.getTime() + 3 * 60 * 60 * 1000);
  return { pickupStartsAt, pickupEndsAt };
}

async function seed() {
  const password = process.env.SEED_PASSWORD ?? '';
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    console.error('Set SEED_PASSWORD to at least 12 characters and at most 72 UTF-8 bytes');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  }) });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const window = pickupWindow();
    await prisma.$transaction(async (db) => {
      for (const allergen of allergens) {
        await db.allergen.upsert({ where: { id: allergen.id }, update: {}, create: allergen });
      }
      await db.user.upsert({
        where: { id: demoId(1) },
        update: {},
        create: {
          id: demoId(1), name: 'Покупатель FoodShare', email: 'customer@foodshare.example',
          passwordHash, role: Role.CUSTOMER, allergens: { create: [{ allergenId: 'peanuts' }, { allergenId: 'lactose' }] },
        },
      });

      for (const [venueIndex, venue] of venues.entries()) {
        const ownerId = demoId(10 + venueIndex);
        const establishmentId = demoId(20 + venueIndex);
        const [latitude, longitude] = venue.position;
        await db.user.upsert({
          where: { id: ownerId },
          update: {},
          create: {
            id: ownerId, name: venue.name, email: `venue${venueIndex + 1}@foodshare.example`,
            passwordHash, role: Role.ESTABLISHMENT,
          },
        });
        await db.establishment.upsert({
          where: { id: establishmentId },
          update: {},
          create: {
            id: establishmentId, ownerId, name: venue.name, description: 'Тестовое заведение для локальной витрины.',
            address: 'Киров, демонстрационная точка', latitude, longitude, categories: [venue.category],
            status: EstablishmentStatus.ACTIVE, businessHours: { daily: { opens: '09:00', closes: '21:00' } },
          },
        });
        for (const [offerIndex, offer] of venue.offers.entries()) {
          const index = venueIndex * venue.offers.length + offerIndex;
          const templateId = demoId(100 + index);
          const offerId = demoId(200 + index);
          const type = offer.size ? OfferType.SURPRISE_BOX : OfferType.ITEM;
          const price = offer.priceRub * 100;
          const originalPrice = (offer.size ? Math.round(offer.priceRub * 3.3) : offer.priceRub * 2) * 100;
          const data = {
            establishmentId, name: offer.name, type, size: offer.size, category: offer.category, price,
            originalPrice, weightGrams: offer.weightGrams,
            allergens: { create: offer.allergenIds.map((allergenId) => ({ allergenId })) },
          };
          if (type === OfferType.SURPRISE_BOX) {
            await db.offerTemplate.upsert({ where: { id: templateId }, update: {}, create: { id: templateId, ...data } });
          }
          const quantity = 3 + (index % 5);
          await db.offer.upsert({
            where: { id: offerId },
            update: {},
            create: {
              id: offerId, ...data, ...window, quantity, remainingQuantity: quantity,
              templateId: type === OfferType.SURPRISE_BOX ? templateId : undefined,
            },
          });
        }
      }
    });
    console.info('FoodShare seed completed');
  } catch {
    console.error('FoodShare seed failed. Check the database, migrations and availability of fixture accounts.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
