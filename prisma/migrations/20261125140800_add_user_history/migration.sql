ALTER TABLE `ApplicationSetting`
    ADD COLUMN `userHistoryEnabled` BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE `UserHistoryEntry` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `subjectUserId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `changedFields` JSON NOT NULL,
    `roleFrom` VARCHAR(191) NULL,
    `roleTo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserHistoryEntry_createdAt_idx`(`createdAt`),
    INDEX `UserHistoryEntry_subjectUserId_createdAt_idx`(`subjectUserId`, `createdAt`),
    INDEX `UserHistoryEntry_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
