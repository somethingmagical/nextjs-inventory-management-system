ALTER TABLE `SaleReturnItem`
    ADD COLUMN `unit` VARCHAR(191) NOT NULL DEFAULT 'piece';

UPDATE `SaleReturnItem` AS returnItem
JOIN `Product` AS product ON product.`id` = returnItem.`productId`
SET returnItem.`unit` = product.`unit`;

ALTER TABLE `SaleReturnItem`
    MODIFY COLUMN `unit` VARCHAR(191) NOT NULL;
