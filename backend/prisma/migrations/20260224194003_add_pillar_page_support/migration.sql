-- AlterTable: Add pillar page support columns to BlogPost
ALTER TABLE "BlogPost" ADD COLUMN "isPillar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogPost" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "pillarId" TEXT;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BlogPost_pillarId_idx" ON "BlogPost"("pillarId");
CREATE INDEX "BlogPost_isPillar_idx" ON "BlogPost"("isPillar");
