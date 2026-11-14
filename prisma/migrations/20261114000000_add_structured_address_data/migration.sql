ALTER TABLE `Warehouse`
  MODIFY `zipCode` VARCHAR(191) NULL,
  ADD COLUMN `countryCode` CHAR(2) NULL,
  ADD COLUMN `addressData` JSON NULL;

ALTER TABLE `Supplier`
  ADD COLUMN `countryCode` CHAR(2) NULL,
  ADD COLUMN `addressData` JSON NULL;

ALTER TABLE `Customer`
  ADD COLUMN `countryCode` CHAR(2) NULL,
  ADD COLUMN `addressData` JSON NULL;
