BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'ESTABLISHMENT');

-- CreateEnum
CREATE TYPE "EstablishmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EstablishmentCategory" AS ENUM ('COFFEE_SHOP', 'BAKERY', 'RESTAURANT', 'STORE');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('SURPRISE_BOX', 'ITEM');

-- CreateEnum
CREATE TYPE "OfferSize" AS ENUM ('S', 'M', 'L');

-- CreateEnum
CREATE TYPE "OfferCategory" AS ENUM ('BAKED_GOODS', 'DESSERTS', 'PREPARED_MEALS', 'SALADS', 'GROCERIES');

-- CreateEnum
CREATE TYPE "PickupMethod" AS ENUM ('PICKUP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RESERVED', 'PAID', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Establishment" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "publicPhone" TEXT,
    "publicEmail" TEXT,
    "businessHours" JSONB,
    "categories" "EstablishmentCategory"[] DEFAULT ARRAY[]::"EstablishmentCategory"[],
    "status" "EstablishmentStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferTemplate" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "OfferType" NOT NULL,
    "size" "OfferSize",
    "category" "OfferCategory" NOT NULL,
    "originalPrice" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OfferTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "templateId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "OfferType" NOT NULL,
    "size" "OfferSize",
    "category" "OfferCategory" NOT NULL,
    "originalPrice" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "pickupStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "pickupEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Allergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAllergen" (
    "userId" UUID NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "UserAllergen_pkey" PRIMARY KEY ("userId","allergenId")
);

-- CreateTable
CREATE TABLE "OfferAllergen" (
    "offerId" UUID NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "OfferAllergen_pkey" PRIMARY KEY ("offerId","allergenId")
);

-- CreateTable
CREATE TABLE "TemplateAllergen" (
    "templateId" UUID NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "TemplateAllergen_pkey" PRIMARY KEY ("templateId","allergenId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RESERVED',
    "pickupMethod" "PickupMethod" NOT NULL DEFAULT 'PICKUP',
    "pickupStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "pickupEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "pickupPinHash" TEXT,
    "pickupQrHash" TEXT,
    "pickupCredentialsCiphertext" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "offerName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitWeightGrams" INTEGER NOT NULL,
    "pickupStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "pickupEndsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "refundedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","offerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_ownerId_key" ON "Establishment"("ownerId");

-- CreateIndex
CREATE INDEX "Establishment_status_latitude_longitude_idx" ON "Establishment"("status", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "OfferTemplate_establishmentId_idx" ON "OfferTemplate"("establishmentId");

-- CreateIndex
CREATE INDEX "Offer_establishmentId_pickupEndsAt_idx" ON "Offer"("establishmentId", "pickupEndsAt");

-- CreateIndex
CREATE INDEX "Offer_category_price_idx" ON "Offer"("category", "price");

-- CreateIndex
CREATE INDEX "Offer_pickupEndsAt_id_idx" ON "Offer"("pickupEndsAt", "id");

-- CreateIndex
CREATE INDEX "Offer_templateId_idx" ON "Offer"("templateId");

-- CreateIndex
CREATE INDEX "UserAllergen_allergenId_idx" ON "UserAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "OfferAllergen_allergenId_idx" ON "OfferAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "TemplateAllergen_allergenId_idx" ON "TemplateAllergen"("allergenId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickupQrHash_key" ON "Order"("pickupQrHash");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_id_idx" ON "Order"("customerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_establishmentId_status_createdAt_id_idx" ON "Order"("establishmentId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_establishmentId_completedAt_idx" ON "Order"("establishmentId", "completedAt");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_offerId_idx" ON "OrderItem"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_offerId_key" ON "OrderItem"("orderId", "offerId");

-- CreateIndex
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_idempotencyKey_key" ON "Payment"("orderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_establishmentId_createdAt_id_idx" ON "Review"("establishmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_offerId_idx" ON "Favorite"("userId", "createdAt", "offerId");

-- CreateIndex
CREATE INDEX "Favorite_offerId_idx" ON "Favorite"("offerId");

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferTemplate" ADD CONSTRAINT "OfferTemplate_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OfferTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAllergen" ADD CONSTRAINT "UserAllergen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAllergen" ADD CONSTRAINT "UserAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferAllergen" ADD CONSTRAINT "OfferAllergen_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferAllergen" ADD CONSTRAINT "OfferAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAllergen" ADD CONSTRAINT "TemplateAllergen_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OfferTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAllergen" ADD CONSTRAINT "TemplateAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent duplicate active PINs within the same establishment. QR hashes are separately unique.
CREATE UNIQUE INDEX "Order_active_pickup_pin_key" ON "Order" ("establishmentId", "pickupPinHash")
    WHERE "pickupPinHash" IS NOT NULL AND "status" IN ('RESERVED', 'PAID', 'READY');

-- A refunded payment still counts as the one successful charge for the order.
CREATE UNIQUE INDEX "Payment_successful_charge_key" ON "Payment" ("orderId")
    WHERE "status" IN ('SUCCEEDED', 'REFUNDED');

ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_coordinates_check"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL)
       AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)));

ALTER TABLE "OfferTemplate" ADD CONSTRAINT "OfferTemplate_pricing_size_check"
    CHECK ("price" > 0 AND "originalPrice" >= "price" AND "weightGrams" > 0
       AND ("type" = 'SURPRISE_BOX') = ("size" IS NOT NULL));

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_pricing_size_check"
    CHECK ("price" > 0 AND "originalPrice" >= "price" AND "weightGrams" > 0
       AND ("type" = 'SURPRISE_BOX') = ("size" IS NOT NULL));

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_stock_pickup_check"
    CHECK ("remainingQuantity" >= 0 AND "quantity" >= "remainingQuantity"
       AND "pickupStartsAt" < "pickupEndsAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_total_pickup_check"
    CHECK ("totalAmount" > 0 AND "commissionBps" BETWEEN 0 AND 10000
       AND "commissionAmount" BETWEEN 0 AND "totalAmount"
       AND "pickupStartsAt" < "pickupEndsAt" AND "expiresAt" <= "pickupEndsAt");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_snapshot_check"
    CHECK ("quantity" > 0 AND "unitPrice" > 0 AND "unitWeightGrams" > 0
       AND "pickupStartsAt" < "pickupEndsAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

COMMIT;
