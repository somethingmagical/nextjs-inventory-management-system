ALTER TABLE `Purchase`
    ADD COLUMN `deliveryStatus` ENUM('Pending', 'InTransit', 'Delivered') NOT NULL DEFAULT 'Pending';

UPDATE `Purchase`
SET `deliveryStatus` = 'Delivered'
WHERE `status` = 'Received';

CREATE INDEX `Purchase_deliveryStatus_idx` ON `Purchase`(`deliveryStatus`);
