CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    INDEX `Role_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `Role` (`id`, `name`, `updatedAt`)
SELECT CONCAT('role-', `role`), `role`, CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `role` <> '';

INSERT IGNORE INTO `Role` (`id`, `name`, `updatedAt`) VALUES
    ('role-admin', 'admin', CURRENT_TIMESTAMP(3)),
    ('role-user', 'user', CURRENT_TIMESTAMP(3));
