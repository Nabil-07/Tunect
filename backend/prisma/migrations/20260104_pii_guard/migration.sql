-- Add PII violation audit log table
CREATE TABLE IF NOT EXISTS "PiiViolationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageContent" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "detectedPatterns" JSONB NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'BLOCKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "PiiViolationLog_pkey" PRIMARY KEY ("id")
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS "PiiViolationLog_userId_idx" ON "PiiViolationLog"("userId");
CREATE INDEX IF NOT EXISTS "PiiViolationLog_createdAt_idx" ON "PiiViolationLog"("createdAt");

-- Add foreign key
ALTER TABLE "PiiViolationLog" ADD CONSTRAINT "PiiViolationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
