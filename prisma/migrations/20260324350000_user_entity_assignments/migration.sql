-- Admin can be assigned to one or more entities. Super admin stays unassigned
-- and implicitly covers every entity.

ALTER TABLE `User` MODIFY `role` ENUM('SUPER_ADMIN', 'ENTITY_ADMIN', 'ADMIN') NOT NULL;

UPDATE `User` SET `role` = 'ADMIN' WHERE `role` = 'ENTITY_ADMIN';

ALTER TABLE `User` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN') NOT NULL;

CREATE TABLE `UserEntity` (
    `userId` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `entityId`),
    INDEX `UserEntity_entityId_idx`(`entityId`),
    CONSTRAINT `UserEntity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `UserEntity_entityId_fkey` FOREIGN KEY (`entityId`) REFERENCES `Entity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `UserEntity` (`userId`, `entityId`)
SELECT `id`, `entityId` FROM `User` WHERE `entityId` IS NOT NULL;

DELETE `UserEntity` FROM `UserEntity`
INNER JOIN `User` ON `User`.`id` = `UserEntity`.`userId`
WHERE `User`.`role` = 'SUPER_ADMIN';

ALTER TABLE `User` DROP FOREIGN KEY `User_entityId_fkey`;
DROP INDEX `User_entityId_idx` ON `User`;
ALTER TABLE `User` DROP COLUMN `entityId`;
