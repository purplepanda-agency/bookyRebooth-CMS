-- CreateTable
CREATE TABLE `SellerScheduleException` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('OFF', 'WORKING') NOT NULL,
    `startDate` VARCHAR(10) NOT NULL,
    `endDate` VARCHAR(10) NOT NULL,
    `repeat` ENUM('NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY') NOT NULL DEFAULT 'NONE',
    `excludedDates` JSON NOT NULL,
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SellerScheduleException_sellerId_idx`(`sellerId`),
    INDEX `SellerScheduleException_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SellerScheduleException` ADD CONSTRAINT `SellerScheduleException_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `Seller`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellerScheduleException` ADD CONSTRAINT `SellerScheduleException_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
