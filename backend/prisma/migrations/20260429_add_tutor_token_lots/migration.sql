-- CreateTable
CREATE TABLE "TutorTokenLot" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "pricePerToken" DECIMAL(10,2) NOT NULL,
    "initialQty" DECIMAL(10,2) NOT NULL,
    "remainingQty" DECIMAL(10,2) NOT NULL,
    "paymentId" TEXT,
    "sourceLotId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorTokenLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingLotConsumption" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "pricePerToken" DECIMAL(10,2) NOT NULL,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingLotConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorTokenLot_studentId_tutorId_purchasedAt_idx" ON "TutorTokenLot"("studentId", "tutorId", "purchasedAt");

-- CreateIndex
CREATE INDEX "TutorTokenLot_studentId_tutorId_remainingQty_idx" ON "TutorTokenLot"("studentId", "tutorId", "remainingQty");

-- CreateIndex
CREATE INDEX "TutorTokenLot_expiresAt_idx" ON "TutorTokenLot"("expiresAt");

-- CreateIndex
CREATE INDEX "TutorTokenLot_paymentId_idx" ON "TutorTokenLot"("paymentId");

-- CreateIndex
CREATE INDEX "BookingLotConsumption_bookingId_idx" ON "BookingLotConsumption"("bookingId");

-- CreateIndex
CREATE INDEX "BookingLotConsumption_lotId_idx" ON "BookingLotConsumption"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLotConsumption_bookingId_lotId_key" ON "BookingLotConsumption"("bookingId", "lotId");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "TutorTokenLot" ADD CONSTRAINT "TutorTokenLot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTokenLot" ADD CONSTRAINT "TutorTokenLot_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTokenLot" ADD CONSTRAINT "TutorTokenLot_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTokenLot" ADD CONSTRAINT "TutorTokenLot_sourceLotId_fkey" FOREIGN KEY ("sourceLotId") REFERENCES "TutorTokenLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLotConsumption" ADD CONSTRAINT "BookingLotConsumption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLotConsumption" ADD CONSTRAINT "BookingLotConsumption_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "TutorTokenLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
