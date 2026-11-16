-- CreateTable
CREATE TABLE `ContentBlock` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `text` TEXT NOT NULL,
    `buttonLabel` VARCHAR(120) NULL,
    `buttonUrl` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `entityId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContentBlock_entityId_sortOrder_idx`(`entityId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentBlockStep` (
    `contentBlockId` VARCHAR(191) NOT NULL,
    `flowStepId` VARCHAR(191) NOT NULL,

    INDEX `ContentBlockStep_flowStepId_idx`(`flowStepId`),
    PRIMARY KEY (`contentBlockId`, `flowStepId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContentBlock` ADD CONSTRAINT `ContentBlock_entityId_fkey` FOREIGN KEY (`entityId`) REFERENCES `Entity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentBlockStep` ADD CONSTRAINT `ContentBlockStep_contentBlockId_fkey` FOREIGN KEY (`contentBlockId`) REFERENCES `ContentBlock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentBlockStep` ADD CONSTRAINT `ContentBlockStep_flowStepId_fkey` FOREIGN KEY (`flowStepId`) REFERENCES `FlowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
