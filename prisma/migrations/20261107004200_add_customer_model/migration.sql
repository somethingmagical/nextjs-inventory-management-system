CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `country` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Customer` (
    `id`,
    `name`,
    `email`,
    `phoneNumber`,
    `country`,
    `city`,
    `address`,
    `createdAt`,
    `updatedAt`
) VALUES (
    'direct-customer',
    'direct-customer',
    'direct-customer@inventory.local',
    'N/A',
    'N/A',
    'N/A',
    'POS walk-in customer',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
);
