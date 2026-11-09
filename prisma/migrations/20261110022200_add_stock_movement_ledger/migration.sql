CREATE TABLE `StockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `type` ENUM(
        'OpeningBalance',
        'ProductInitialization',
        'PurchaseReceipt',
        'PurchaseReturn',
        'Sale',
        'SaleReturn',
        'Adjustment',
        'Transfer',
        'Reconciliation'
    ) NOT NULL,
    `sourceType` ENUM(
        'Product',
        'Purchase',
        'PurchaseReturn',
        'Sale',
        'SaleReturn',
        'Adjustment',
        'Transfer'
    ) NULL,
    `sourceId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_productId_warehouseId_createdAt_idx`(`productId`, `warehouseId`, `createdAt`),
    INDEX `StockMovement_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    INDEX `StockMovement_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `StockMovement_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `StockMovement_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `StockMovement_actorId_fkey`
        FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `StockMovement` (
    `id`,
    `productId`,
    `warehouseId`,
    `quantity`,
    `type`,
    `sourceType`,
    `sourceId`,
    `createdAt`
)
SELECT
    CONCAT('cutover_', REPLACE(UUID(), '-', '')),
    `productId`,
    `warehouseId`,
    `quantity`,
    'OpeningBalance',
    NULL,
    NULL,
    CURRENT_TIMESTAMP(3)
FROM `ProductStock`
WHERE `quantity` <> 0;
