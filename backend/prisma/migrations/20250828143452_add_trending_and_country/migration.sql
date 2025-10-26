-- AlterTable
ALTER TABLE "public"."Tutor" ADD COLUMN     "country" TEXT,
ADD COLUMN     "isTrending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Tutor_isTrending_updatedAt_idx" ON "public"."Tutor"("isTrending", "updatedAt");
