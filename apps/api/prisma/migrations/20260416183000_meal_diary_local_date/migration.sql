-- Локальный календарный день дневника (для синхронизации воды с DailyWater при удалении приёма)
ALTER TABLE "MealEntry" ADD COLUMN "diaryLocalDate" TEXT;
