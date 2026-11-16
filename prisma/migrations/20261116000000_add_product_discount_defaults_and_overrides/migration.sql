ALTER TABLE `Product`
    ADD COLUMN `defaultDiscountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Percentage',
    ADD COLUMN `defaultDiscount` DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE `ProductWarehouseDiscount` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `discountType` ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Percentage',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductWarehouseDiscount_productId_warehouseId_key`(`productId`, `warehouseId`),
    INDEX `ProductWarehouseDiscount_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ProductWarehouseDiscount_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ProductWarehouseDiscount_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
