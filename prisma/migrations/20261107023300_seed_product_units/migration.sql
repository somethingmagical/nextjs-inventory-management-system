INSERT INTO `Unit` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), defaults.`name`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
    SELECT 'piece' AS `name`
    UNION ALL SELECT 'Kilogram'
    UNION ALL SELECT 'Meter'
) AS defaults
WHERE NOT EXISTS (
    SELECT 1 FROM `Unit` AS existing WHERE existing.`name` = defaults.`name`
);
