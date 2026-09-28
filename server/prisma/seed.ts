import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начало заполнения базы тестовыми данными...');
  
  await prisma.restaurant.create({
    data: {
      name: 'Пекарня «Хлебная лавка»',
      address: 'ул. Тверская, д. 12',
      lat: 55.7558,
      lng: 37.6173,
      boxes: {
        create: [
          {
            title: 'Свежая выпечка и круассаны (Box M)',
            price: 600,
            discountPrice: 200,
          }
        ]
      }
    }
  });

  console.log('База данных успешно наполнена первичными данными.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
