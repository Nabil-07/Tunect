-- Add default UUID generation for id columns
ALTER TABLE "Booking" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Conversation" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Notification" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Payment" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Refund" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Reminder" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Review" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "SessionNote" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Student" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "StudentProgress" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "StudyMaterial" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "TokenLedger" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Tutor" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "TutorTokenBalance" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "User" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Waitlist" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "PerformanceReport" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "RecurringTemplate" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Add default NOW() for updatedAt columns  
ALTER TABLE "Booking" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "SessionNote" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "Student" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "StudentProgress" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "Tutor" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "TutorWallet" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE "Waitlist" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
