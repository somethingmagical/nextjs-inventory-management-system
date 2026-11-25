ALTER TABLE `ProductStock`
    DROP FOREIGN KEY `ProductStock_productId_fkey`;

ALTER TABLE `ProductStock`
    ADD COLUMN `reservedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `ProductStock_productId_warehouseId_status_key`
    ON `ProductStock` (`productId`, `warehouseId`, `status`);

ALTER TABLE `ProductStock`
    DROP INDEX `ProductStock_productId_warehouseId_key`;

ALTER TABLE `ProductStock`
    ADD CONSTRAINT `ProductStock_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ProductUnitConversion` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `conversionFactor` DECIMAL(12, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ProductUnitConversion_productId_unitId_key` (`productId`, `unitId`),
    INDEX `ProductUnitConversion_unitId_idx` (`unitId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ProductUnitConversion_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ProductUnitConversion_unitId_fkey`
        FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PurchaseItem`
    ADD COLUMN `stockConversionFactor` DECIMAL(12, 6) NOT NULL DEFAULT 1;

ALTER TABLE `PurchaseReturnItem`
    ADD COLUMN `stockConversionFactor` DECIMAL(12, 6) NOT NULL DEFAULT 1;

ALTER TABLE `SaleItem`
    ADD COLUMN `stockConversionFactor` DECIMAL(12, 6) NOT NULL DEFAULT 1;

ALTER TABLE `SaleReturnItem`
    ADD COLUMN `stockConversionFactor` DECIMAL(12, 6) NOT NULL DEFAULT 1;
