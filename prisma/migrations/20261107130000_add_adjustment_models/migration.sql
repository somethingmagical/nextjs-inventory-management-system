ALTER TABLE `ProductStock`
    MODIFY COLUMN `supplierId` VARCHAR(191) NULL;

CREATE TABLE `Adjustment` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Adjustment_reference_key`(`reference`),
    INDEX `Adjustment_warehouseId_idx`(`warehouseId`),
    INDEX `Adjustment_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Adjustment_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdjustmentItem` (
    `id` VARCHAR(191) NOT NULL,
    `adjustmentId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `type` ENUM('Addition', 'Subtraction') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AdjustmentItem_adjustmentId_idx`(`adjustmentId`),
    INDEX `AdjustmentItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `AdjustmentItem_adjustmentId_fkey`
        FOREIGN KEY (`adjustmentId`) REFERENCES `Adjustment`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `AdjustmentItem_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
