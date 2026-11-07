CREATE TABLE `PurchaseReturn` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('Pending', 'Ordered', 'Received') NOT NULL DEFAULT 'Received',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `due` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paymentType` VARCHAR(191) NOT NULL DEFAULT 'Cash',
    `notes` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PurchaseReturn_reference_key`(`reference`),
    INDEX `PurchaseReturn_supplierId_idx`(`supplierId`),
    INDEX `PurchaseReturn_warehouseId_idx`(`warehouseId`),
    INDEX `PurchaseReturn_date_idx`(`date`),
    INDEX `PurchaseReturn_status_idx`(`status`),
    INDEX `PurchaseReturn_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `PurchaseReturn_supplierId_fkey`
        FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `PurchaseReturn_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseReturnItem` (
    `id` VARCHAR(191) NOT NULL,
    `returnId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `netUnitCost` DECIMAL(12, 2) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `discountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` ENUM('Exclusive', 'Inclusive') NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseReturnItem_returnId_idx`(`returnId`),
    INDEX `PurchaseReturnItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `PurchaseReturnItem_returnId_fkey`
        FOREIGN KEY (`returnId`) REFERENCES `PurchaseReturn`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `PurchaseReturnItem_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
