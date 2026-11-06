CREATE TABLE `Unit` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Unit_name_key`(`name`),
    INDEX `Unit_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Unit` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), source.`name`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
    SELECT DISTINCT COALESCE(NULLIF(TRIM(`unit`), ''), 'piece') AS `name`
    FROM `Product`
) AS source
WHERE NOT EXISTS (
    SELECT 1 FROM `Unit` AS existing WHERE existing.`name` = source.`name`
);

INSERT INTO `Category` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), source.`name`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
    SELECT DISTINCT TRIM(`category`) AS `name`
    FROM `Product`
    WHERE `category` IS NOT NULL AND TRIM(`category`) <> ''
) AS source
WHERE NOT EXISTS (
    SELECT 1 FROM `Category` AS existing
    WHERE existing.`name` = source.`name` AND existing.`deletedAt` IS NULL
);

INSERT INTO `Category` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), 'Uncategorized', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE EXISTS (
    SELECT 1 FROM `Product`
    WHERE NULLIF(TRIM(`category`), '') IS NULL
)
AND NOT EXISTS (
    SELECT 1 FROM `Category`
    WHERE `name` = 'Uncategorized' AND `deletedAt` IS NULL
);

INSERT INTO `Brand` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), source.`name`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
    SELECT DISTINCT TRIM(`brand`) AS `name`
    FROM `Product`
    WHERE `brand` IS NOT NULL AND TRIM(`brand`) <> ''
) AS source
WHERE NOT EXISTS (
    SELECT 1 FROM `Brand` AS existing
    WHERE existing.`name` = source.`name` AND existing.`deletedAt` IS NULL
);

INSERT INTO `Brand` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), 'Unbranded', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE EXISTS (
    SELECT 1 FROM `Product`
    WHERE NULLIF(TRIM(`brand`), '') IS NULL
)
AND NOT EXISTS (
    SELECT 1 FROM `Brand`
    WHERE `name` = 'Unbranded' AND `deletedAt` IS NULL
);

ALTER TABLE `Product`
    ADD COLUMN `price` DECIMAL(12, 2) NULL,
    ADD COLUMN `categoryId` VARCHAR(191) NULL,
    ADD COLUMN `brandId` VARCHAR(191) NULL,
    ADD COLUMN `productUnit` VARCHAR(191) NULL,
    ADD COLUMN `stockAlert` DECIMAL(12, 3) NULL,
    ADD COLUMN `orderTax` DECIMAL(5, 2) NULL,
    ADD COLUMN `taxType` ENUM('Exclusive', 'Inclusive') NULL,
    ADD COLUMN `quantityLimitation` DECIMAL(12, 3) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `images` JSON NULL;

UPDATE `Product` AS product
SET
    product.`price` = product.`sellingPrice`,
    product.`categoryId` = (
        SELECT category.`id`
        FROM `Category` AS category
        WHERE category.`name` = COALESCE(NULLIF(TRIM(product.`category`), ''), 'Uncategorized')
          AND category.`deletedAt` IS NULL
        ORDER BY category.`createdAt`, category.`id`
        LIMIT 1
    ),
    product.`brandId` = (
        SELECT brand.`id`
        FROM `Brand` AS brand
        WHERE brand.`name` = COALESCE(NULLIF(TRIM(product.`brand`), ''), 'Unbranded')
          AND brand.`deletedAt` IS NULL
        ORDER BY brand.`createdAt`, brand.`id`
        LIMIT 1
    ),
    product.`productUnit` = COALESCE(NULLIF(TRIM(product.`unit`), ''), 'piece'),
    product.`stockAlert` = product.`alertQuantity`,
    product.`orderTax` = 0,
    product.`taxType` = 'Exclusive',
    product.`quantityLimitation` = NULL,
    product.`notes` = product.`description`,
    product.`images` = CASE
        WHEN product.`image` IS NULL OR product.`image` = '' THEN NULL
        ELSE JSON_ARRAY(product.`image`)
    END;

ALTER TABLE `Product`
    MODIFY COLUMN `price` DECIMAL(12, 2) NOT NULL,
    MODIFY COLUMN `categoryId` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `brandId` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `productUnit` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `taxType` ENUM('Exclusive', 'Inclusive') NOT NULL DEFAULT 'Exclusive',
    ADD INDEX `Product_categoryId_idx`(`categoryId`),
    ADD INDEX `Product_brandId_idx`(`brandId`),
    ADD CONSTRAINT `Product_categoryId_fkey`
        FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `Product_brandId_fkey`
        FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ProductStock` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `status` ENUM('Received', 'Pending', 'Ordered') NOT NULL DEFAULT 'Received',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductStock_productId_warehouseId_key`(`productId`, `warehouseId`),
    INDEX `ProductStock_warehouseId_idx`(`warehouseId`),
    INDEX `ProductStock_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ProductStock_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ProductStock_warehouseId_fkey`
        FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ProductStock_supplierId_fkey`
        FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
