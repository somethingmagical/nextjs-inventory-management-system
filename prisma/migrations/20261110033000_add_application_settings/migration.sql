CREATE TABLE `ApplicationSetting` (
    `id` VARCHAR(191) NOT NULL,
    `appName` VARCHAR(100) NOT NULL,
    `faviconPath` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
