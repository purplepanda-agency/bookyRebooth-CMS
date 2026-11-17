-- AlterTable
ALTER TABLE `Entity` ADD COLUMN `googleOAuthClientId` VARCHAR(255) NULL,
    ADD COLUMN `googleOAuthClientSecretEnc` TEXT NULL;
