-- Add new fields to Tutor model for enhanced profiles
-- Migration: Add tutor profile fields
-- Date: 2026-01-01

ALTER TABLE "Tutor" 
ADD COLUMN IF NOT EXISTS "summary" TEXT,
ADD COLUMN IF NOT EXISTS "degrees" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "classesTeach" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "qualifications" TEXT,
ADD COLUMN IF NOT EXISTS "yearsExperience" INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN "Tutor"."summary" IS 'Detailed summary of teaching philosophy and approach';
COMMENT ON COLUMN "Tutor"."degrees" IS 'Array of educational degrees and qualifications';
COMMENT ON COLUMN "Tutor"."classesTeach" IS 'Array of grades/classes the tutor can teach';
COMMENT ON COLUMN "Tutor"."qualifications" IS 'Brief qualifications text';
COMMENT ON COLUMN "Tutor"."yearsExperience" IS 'Years of teaching experience';
