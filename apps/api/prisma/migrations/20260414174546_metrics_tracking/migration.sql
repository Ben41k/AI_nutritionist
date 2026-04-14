-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "startWeightKg" DOUBLE PRECISION,
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION,
ADD COLUMN     "waterGoalMl" INTEGER NOT NULL DEFAULT 2000;

-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWater" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "totalMl" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyWater_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "neckCm" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "hipsCm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeightEntry_userId_recordedAt_idx" ON "WeightEntry"("userId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWater_userId_day_key" ON "DailyWater"("userId", "day");

-- CreateIndex
CREATE INDEX "BodyMeasurement_userId_recordedAt_idx" ON "BodyMeasurement"("userId", "recordedAt");

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWater" ADD CONSTRAINT "DailyWater_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
