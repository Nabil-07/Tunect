-- Fix NULL values before schema push
UPDATE "RecurringTemplate" SET "isGroupSession" = false WHERE "isGroupSession" IS NULL;
UPDATE "RecurringTemplate" SET "maxGroupSize" = 1 WHERE "maxGroupSize" IS NULL;
