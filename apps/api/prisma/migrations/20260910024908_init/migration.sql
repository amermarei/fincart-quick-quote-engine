-- CreateEnum
CREATE TYPE "MerchantTier" AS ENUM ('STANDARD', 'PLUS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CarrierId" AS ENUM ('SWIFTPOST', 'ATLAS', 'MERIDIAN');

-- CreateEnum
CREATE TYPE "QuoteRateStatus" AS ENUM ('QUOTED', 'FAILED', 'NO_SERVICE', 'GIVEN_UP');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tier" "MerchantTier" NOT NULL,
    "carrierAccountRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "originPostcode" TEXT NOT NULL,
    "originTimezone" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationPostcode" TEXT NOT NULL,
    "weightKg" DECIMAL(65,30) NOT NULL,
    "lengthCm" DECIMAL(65,30) NOT NULL,
    "widthCm" DECIMAL(65,30) NOT NULL,
    "heightCm" DECIMAL(65,30) NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "carrier" "CarrierId" NOT NULL,
    "status" "QuoteRateStatus" NOT NULL,
    "service" TEXT,
    "baseMinor" INTEGER,
    "taxMinor" INTEGER,
    "totalMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "etaFrom" TIMESTAMP(3),
    "etaTo" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRate" ADD CONSTRAINT "QuoteRate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

