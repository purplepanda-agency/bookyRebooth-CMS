-- CreateTable helper enum for per-entity calendar providers
ALTER TABLE `Entity` ADD COLUMN `calendarProvider` ENUM('NONE', 'OUTLOOK', 'GOOGLE') NOT NULL DEFAULT 'NONE';
ALTER TABLE `Entity` ADD COLUMN `calendarTimezone` VARCHAR(64) NOT NULL DEFAULT 'Europe/Brussels';
ALTER TABLE `Entity` ADD COLUMN `outlookTenantId` VARCHAR(64) NULL;
ALTER TABLE `Entity` ADD COLUMN `outlookClientId` VARCHAR(64) NULL;
ALTER TABLE `Entity` ADD COLUMN `outlookClientSecretEnc` TEXT NULL;
ALTER TABLE `Entity` ADD COLUMN `googleClientEmail` VARCHAR(255) NULL;
ALTER TABLE `Entity` ADD COLUMN `googlePrivateKeyEnc` TEXT NULL;
ALTER TABLE `Entity` ADD COLUMN `googleSubject` VARCHAR(255) NULL;
