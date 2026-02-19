-- AlterTable
ALTER TABLE "public"."Student"
ADD COLUMN "board" TEXT;

-- AlterTable
ALTER TABLE "public"."Tutor"
ADD COLUMN "boards" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "classSubjectMappings" JSONB;

-- Optional comments
COMMENT ON COLUMN "Tutor"."boards" IS 'Boards tutor is comfortable teaching (e.g., CBSE, ICSE, State Board)';
COMMENT ON COLUMN "Tutor"."classSubjectMappings" IS 'Structured class-subject mappings: [{classRange, subjects[]}]';
COMMENT ON COLUMN "Student"."board" IS 'Student education board (e.g., CBSE, ICSE, State Board)';
