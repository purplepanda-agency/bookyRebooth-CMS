-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NOT NULL,
    `userRole` ENUM('SUPER_ADMIN', 'ADMIN') NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `entityId` VARCHAR(191) NULL,
    `entityName` VARCHAR(255) NULL,
    `entityIds` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    INDEX `ActivityLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `ActivityLog_entityId_createdAt_idx`(`entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
