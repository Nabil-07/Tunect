-- Migration: Add Pricing Engine Models
-- Adds FeeBracket, TokenPack, PackOffer, Coupon, CouponUsage, CouponBracket,
-- CouponPack, CouponUser, PackPurchaseRule, CurrencyConfig models + enums

-- Enums
CREATE TYPE "CouponUsageFrequency" AS ENUM (
  'ONE_TIME', 'ONCE_PER_MONTH', 'ONCE_PER_QUARTER', 'ONCE_PER_YEAR', 'UNLIMITED', 'CUSTOM'
);

CREATE TYPE "PackRuleType" AS ENUM (
  'MAX_PURCHASES_PER_PERIOD', 'ONE_PER_CALENDAR_MONTH', 'ONE_DISCOUNTED_AT_A_TIME', 'ALLOW_MULTIPLE', 'RESTRICT_DUPLICATE'
);

-- FeeBracket
CREATE TABLE "FeeBracket" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "minRate"       DECIMAL(10,2) NOT NULL,
  "maxRate"       DECIMAL(10,2),
  "commissionPct" DECIMAL(5,2) NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "displayOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeBracket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeeBracket_isActive_idx" ON "FeeBracket"("isActive");
CREATE INDEX "FeeBracket_minRate_idx" ON "FeeBracket"("minRate");

-- TokenPack
CREATE TABLE "TokenPack" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "displayLabel"     TEXT NOT NULL,
  "tokenCount"       INTEGER NOT NULL,
  "badgeLabel"       TEXT,
  "isHighlighted"    BOOLEAN NOT NULL DEFAULT false,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "isVisible"        BOOLEAN NOT NULL DEFAULT true,
  "displayOrder"     INTEGER NOT NULL DEFAULT 0,
  "maxPurchaseLimit" INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenPack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TokenPack_isActive_isVisible_idx" ON "TokenPack"("isActive", "isVisible");
CREATE INDEX "TokenPack_displayOrder_idx" ON "TokenPack"("displayOrder");

-- PackOffer
CREATE TABLE "PackOffer" (
  "id"            TEXT NOT NULL,
  "packId"        TEXT NOT NULL,
  "bracketId"     TEXT NOT NULL,
  "discountType"  "DiscountType" NOT NULL,
  "discountValue" DECIMAL(10,2) NOT NULL,
  "discountCap"   DECIMAL(10,2),
  "startDate"     TIMESTAMP(3),
  "endDate"       TIMESTAMP(3),
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PackOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackOffer_packId_bracketId_idx" ON "PackOffer"("packId", "bracketId");
CREATE INDEX "PackOffer_isActive_idx" ON "PackOffer"("isActive");
ALTER TABLE "PackOffer" ADD CONSTRAINT "PackOffer_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TokenPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackOffer" ADD CONSTRAINT "PackOffer_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "FeeBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coupon
CREATE TABLE "Coupon" (
  "id"                   TEXT NOT NULL,
  "code"                 TEXT NOT NULL,
  "description"          TEXT,
  "discountType"         "DiscountType" NOT NULL,
  "discountValue"        DECIMAL(10,2) NOT NULL,
  "discountCap"          DECIMAL(10,2),
  "minCartValue"         DECIMAL(10,2),
  "startDate"            TIMESTAMP(3),
  "endDate"              TIMESTAMP(3),
  "isActive"             BOOLEAN NOT NULL DEFAULT true,
  "usageFrequency"       "CouponUsageFrequency" NOT NULL DEFAULT 'ONE_TIME',
  "customUsageLimit"     INTEGER,
  "totalRedemptionLimit" INTEGER,
  "perUserLimit"         INTEGER,
  "usedCount"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_code_isActive_idx" ON "Coupon"("code", "isActive");

-- CouponUsage
CREATE TABLE "CouponUsage" (
  "id"        TEXT NOT NULL,
  "couponId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "usedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentId" TEXT,
  CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CouponUsage_couponId_userId_idx" ON "CouponUsage"("couponId", "userId");
CREATE INDEX "CouponUsage_userId_idx" ON "CouponUsage"("userId");
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CouponBracket (join table)
CREATE TABLE "CouponBracket" (
  "couponId"  TEXT NOT NULL,
  "bracketId" TEXT NOT NULL,
  CONSTRAINT "CouponBracket_pkey" PRIMARY KEY ("couponId", "bracketId")
);
ALTER TABLE "CouponBracket" ADD CONSTRAINT "CouponBracket_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponBracket" ADD CONSTRAINT "CouponBracket_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "FeeBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CouponPack (join table)
CREATE TABLE "CouponPack" (
  "couponId" TEXT NOT NULL,
  "packId"   TEXT NOT NULL,
  CONSTRAINT "CouponPack_pkey" PRIMARY KEY ("couponId", "packId")
);
ALTER TABLE "CouponPack" ADD CONSTRAINT "CouponPack_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponPack" ADD CONSTRAINT "CouponPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TokenPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CouponUser (join table)
CREATE TABLE "CouponUser" (
  "couponId" TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  CONSTRAINT "CouponUser_pkey" PRIMARY KEY ("couponId", "userId")
);
ALTER TABLE "CouponUser" ADD CONSTRAINT "CouponUser_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponUser" ADD CONSTRAINT "CouponUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PackPurchaseRule
CREATE TABLE "PackPurchaseRule" (
  "id"          TEXT NOT NULL,
  "packId"      TEXT,
  "description" TEXT NOT NULL,
  "ruleType"    "PackRuleType" NOT NULL,
  "value"       INTEGER,
  "periodDays"  INTEGER,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PackPurchaseRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackPurchaseRule_packId_isActive_idx" ON "PackPurchaseRule"("packId", "isActive");
ALTER TABLE "PackPurchaseRule" ADD CONSTRAINT "PackPurchaseRule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TokenPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CurrencyConfig
CREATE TABLE "CurrencyConfig" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "symbol"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "exchangeRate" DECIMAL(15,6) NOT NULL,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "isDefault"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurrencyConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CurrencyConfig_code_key" ON "CurrencyConfig"("code");
CREATE INDEX "CurrencyConfig_isActive_idx" ON "CurrencyConfig"("isActive");

-- Seed default INR currency
INSERT INTO "CurrencyConfig" ("id", "code", "symbol", "name", "exchangeRate", "isActive", "isDefault", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'INR', '₹', 'Indian Rupee', 1.000000, true, true, NOW(), NOW());

-- Seed default fee brackets
INSERT INTO "FeeBracket" ("id", "name", "minRate", "maxRate", "commissionPct", "isActive", "displayOrder", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Bracket 1', 0, 399, 25.00, true, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'Bracket 2', 400, 699, 22.00, true, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'Bracket 3', 700, NULL, 18.00, true, 3, NOW(), NOW());

-- Seed default token packs
INSERT INTO "TokenPack" ("id", "name", "displayLabel", "tokenCount", "badgeLabel", "isHighlighted", "isActive", "isVisible", "displayOrder", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Starter Pack', '5 Tokens', 5, NULL, false, true, true, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'Weekly Combo', '11 Tokens', 11, 'Most Popular', true, true, true, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'Monthly Pack', '18 Tokens', 18, 'Best Value', false, true, true, 3, NOW(), NOW());
