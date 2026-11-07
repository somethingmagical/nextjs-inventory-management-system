CREATE TABLE `SaleReturn` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `status` ENUM('Pending', 'Ordered', 'Received') NOT NULL DEFAULT 'Received',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `due` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paymentStatus` ENUM('Paid', 'Unpaid', 'Partial') NOT NULL DEFAULT 'Unpaid',
    `notes` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SaleReturn_reference_key`(`reference`),
    INDEX `SaleReturn_customerId_idx`(`customerId`),
    INDEX `SaleReturn_warehouseId_idx`(`warehouseId`),
    INDEX `SaleReturn_saleId_idx`(`saleId`),
    INDEX `SaleReturn_date_idx`(`date`),
    INDEX `SaleReturn_status_idx`(`status`),
    INDEX `SaleReturn_paymentStatus_idx`(`paymentStatus`),
    INDEX `SaleReturn_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `SaleReturn_customerId_fkey`
        FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `SaleReturn_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `SaleReturn_saleId_fkey`
        FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SaleReturnItem` (
    `id` VARCHAR(191) NOT NULL,
    `returnId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `netUnitPrice` DECIMAL(12, 2) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `discountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` ENUM('Exclusive', 'Inclusive') NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SaleReturnItem_returnId_idx`(`returnId`),
    INDEX `SaleReturnItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `SaleReturnItem_returnId_fkey`
        FOREIGN KEY (`returnId`) REFERENCES `SaleReturn`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `SaleReturnItem_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
