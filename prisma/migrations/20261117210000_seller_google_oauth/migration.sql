-- AlterTable
ALTER TABLE `Seller` ADD COLUMN `googleRefreshTokenEnc` TEXT NULL,
    ADD COLUMN `googleConnectedEmail` VARCHAR(255) NULL,
    ADD COLUMN `googleConnectedAt` DATETIME(3) NULL;
