import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

type ProductReference = {
  tableName: string;
  columnName: string;
};

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

export async function productHasReferences(
  client: PrismaClient | Prisma.TransactionClient,
  productId: string,
) {
  const references = await client.$queryRaw<ProductReference[]>(Prisma.sql`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'Product'
      AND REFERENCED_COLUMN_NAME = 'id'
      AND TABLE_NAME <> 'ProductStock'
  `);

  for (const reference of references) {
    const table = Prisma.raw(quoteIdentifier(reference.tableName));
    const column = Prisma.raw(quoteIdentifier(reference.columnName));
    const matchingRows = await client.$queryRaw<Array<{ found: number }>>(Prisma.sql`
      SELECT 1 AS found
      FROM ${table}
      WHERE ${column} = ${productId}
      LIMIT 1
    `);

    if (matchingRows.length > 0) return true;
  }

  return false;
}
