CREATE TABLE `Sale` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('Pending', 'Ordered', 'Received') NOT NULL DEFAULT 'Received',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `due` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paymentStatus` ENUM('Paid', 'Unpaid', 'Partial') NOT NULL DEFAULT 'Unpaid',
    `paymentType` VARCHAR(191) NOT NULL DEFAULT 'Cash',
    `notes` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Sale_reference_key`(`reference`),
    INDEX `Sale_customerId_idx`(`customerId`),
    INDEX `Sale_warehouseId_idx`(`warehouseId`),
    INDEX `Sale_date_idx`(`date`),
    INDEX `Sale_status_idx`(`status`),
    INDEX `Sale_paymentStatus_idx`(`paymentStatus`),
    INDEX `Sale_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Sale_customerId_fkey`
        FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Sale_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SaleItem` (
    `id` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `netUnitPrice` DECIMAL(12, 2) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `discountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` ENUM('Exclusive', 'Inclusive') NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SaleItem_saleId_idx`(`saleId`),
    INDEX `SaleItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `SaleItem_saleId_fkey`
        FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `SaleItem_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SalePayment` (
    `id` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentType` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalePayment_saleId_idx`(`saleId`),
    INDEX `SalePayment_date_idx`(`date`),
    PRIMARY KEY (`id`),
    CONSTRAINT `SalePayment_saleId_fkey`
        FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
