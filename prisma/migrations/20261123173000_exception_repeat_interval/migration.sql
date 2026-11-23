-- Custom repeat interval: every X days, weeks or months.
ALTER TABLE `SellerScheduleException`
  ADD COLUMN `repeatEvery` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `repeatUnit` ENUM('DAY', 'WEEK', 'MONTH') NOT NULL DEFAULT 'DAY';

UPDATE `SellerScheduleException`
SET `repeatUnit` = 'WEEK', `repeatEvery` = 1
WHERE `repeat` = 'WEEKLY';

UPDATE `SellerScheduleException`
SET `repeatUnit` = 'WEEK', `repeatEvery` = 2
WHERE `repeat` = 'BIWEEKLY';

UPDATE `SellerScheduleException`
SET `repeatUnit` = 'MONTH', `repeatEvery` = 1
WHERE `repeat` = 'MONTHLY';

ALTER TABLE `SellerScheduleException` DROP COLUMN `repeat`;
