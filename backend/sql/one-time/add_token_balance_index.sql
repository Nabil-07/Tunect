-- Performance optimization: Add index for token balance queries
-- This will speed up the /students/me/token-balances endpoint

CREATE INDEX IF NOT EXISTS "TutorTokenBalance_studentId_balance_idx" 
ON "TutorTokenBalance" ("studentId", "balance" DESC);

-- Analyze the table to update statistics
ANALYZE "TutorTokenBalance";
