-- AlterTable: Add pillar page support columns to BlogPost (idempotent)
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "isPillar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "pillarId" TEXT;

-- AddForeignKey (idempotent)
DO $$ BEGIN ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "BlogPost_pillarId_idx" ON "BlogPost"("pillarId");
CREATE INDEX IF NOT EXISTS "BlogPost_isPillar_idx" ON "BlogPost"("isPillar");
