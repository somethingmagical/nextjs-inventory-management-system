CREATE TABLE `Transfer` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `fromWarehouseId` VARCHAR(191) NOT NULL,
    `toWarehouseId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('Pending', 'Sent', 'Completed') NOT NULL DEFAULT 'Pending',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Transfer_reference_key`(`reference`),
    INDEX `Transfer_fromWarehouseId_idx`(`fromWarehouseId`),
    INDEX `Transfer_toWarehouseId_idx`(`toWarehouseId`),
    INDEX `Transfer_date_idx`(`date`),
    INDEX `Transfer_status_idx`(`status`),
    INDEX `Transfer_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Transfer_fromWarehouseId_fkey`
        FOREIGN KEY (`fromWarehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Transfer_toWarehouseId_fkey`
        FOREIGN KEY (`toWarehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TransferItem` (
    `id` VARCHAR(191) NOT NULL,
    `transferId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `netUnitCost` DECIMAL(12, 2) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `discountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` ENUM('Exclusive', 'Inclusive') NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransferItem_transferId_idx`(`transferId`),
    INDEX `TransferItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `TransferItem_transferId_fkey`
        FOREIGN KEY (`transferId`) REFERENCES `Transfer`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `TransferItem_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
