-- Add subject, grade, module columns to Booking table
-- Generated from: prisma migrate diff --from-schema-datasource --to-schema-datamodel
ALTER TABLE "Booking" ADD COLUMN "grade" TEXT,
ADD COLUMN "module" TEXT,
ADD COLUMN "subject" TEXT;
