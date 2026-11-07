CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `expenseCategoryId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `details` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Expense_reference_key`(`reference`),
    INDEX `Expense_warehouseId_idx`(`warehouseId`),
    INDEX `Expense_expenseCategoryId_idx`(`expenseCategoryId`),
    INDEX `Expense_date_idx`(`date`),
    INDEX `Expense_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Expense_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Expense_expenseCategoryId_fkey`
        FOREIGN KEY (`expenseCategoryId`) REFERENCES `ExpenseCategory`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
