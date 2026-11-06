ALTER TABLE `User`
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD INDEX `User_deletedAt_idx`(`deletedAt`);
