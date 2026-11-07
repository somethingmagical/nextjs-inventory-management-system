CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permission` VARCHAR(191) NOT NULL,

    INDEX `RolePermission_permission_idx`(`permission`),
    PRIMARY KEY (`roleId`, `permission`),
    CONSTRAINT `RolePermission_roleId_fkey`
        FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Role` (`id`, `name`, `updatedAt`)
SELECT CONCAT('legacy-role-', UUID()), legacy_roles.`name`, CURRENT_TIMESTAMP(3)
FROM (
    SELECT DISTINCT `role` AS `name`
    FROM `User`
    WHERE `role` IS NOT NULL AND `role` <> ''
) AS legacy_roles
LEFT JOIN `Role` existing_role ON existing_role.`name` = legacy_roles.`name`
WHERE existing_role.`id` IS NULL;

INSERT IGNORE INTO `Role` (`id`, `name`, `updatedAt`)
VALUES ('role-user', 'user', CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `Role` (`id`, `name`, `updatedAt`)
VALUES ('role-admin', 'admin', CURRENT_TIMESTAMP(3));

ALTER TABLE `User`
    ADD COLUMN `roleId` VARCHAR(191) NULL;

UPDATE `User` AS user_record
INNER JOIN `Role` AS role_record
    ON role_record.`name` = CASE
        WHEN user_record.`role` IS NULL OR user_record.`role` = '' THEN 'user'
        ELSE user_record.`role`
    END
SET user_record.`roleId` = role_record.`id`;

ALTER TABLE `User`
    MODIFY `roleId` VARCHAR(191) NOT NULL,
    ADD INDEX `User_roleId_idx`(`roleId`),
    ADD CONSTRAINT `User_roleId_fkey`
        FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
SELECT role_record.`id`, permission_list.`permission`
FROM `Role` AS role_record
CROSS JOIN (
    SELECT 'Manage Adjustments' AS `permission`
    UNION ALL SELECT 'Manage Transfers'
    UNION ALL SELECT 'Manage Roles'
    UNION ALL SELECT 'Manage Brands'
    UNION ALL SELECT 'Manage Currency'
    UNION ALL SELECT 'Manage Warehouses'
    UNION ALL SELECT 'Manage Units'
    UNION ALL SELECT 'Manage Product Categories'
    UNION ALL SELECT 'Manage Products'
    UNION ALL SELECT 'Manage Suppliers'
    UNION ALL SELECT 'Manage Customers'
    UNION ALL SELECT 'Manage Users'
    UNION ALL SELECT 'Manage Expense Categories'
    UNION ALL SELECT 'Manage Expenses'
    UNION ALL SELECT 'Manage Setting'
    UNION ALL SELECT 'Manage Dashboard'
    UNION ALL SELECT 'Manage Pos Screen'
    UNION ALL SELECT 'Manage Purchase'
    UNION ALL SELECT 'Manage Sale'
    UNION ALL SELECT 'Manage Purchase Return'
    UNION ALL SELECT 'Manage Sale Return'
    UNION ALL SELECT 'Manage Email Templates'
    UNION ALL SELECT 'Manage Reports'
    UNION ALL SELECT 'Manage Quotations'
    UNION ALL SELECT 'Manage Sms Templates'
    UNION ALL SELECT 'Manage Sms Apis'
    UNION ALL SELECT 'Manage Language'
) AS permission_list
WHERE role_record.`name` = 'admin';
