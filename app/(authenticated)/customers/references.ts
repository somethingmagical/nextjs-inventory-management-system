import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

type CustomerReference = {
  tableName: string;
  columnName: string;
};

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

export async function customerHasSalesOrQuotationReferences(
  client: PrismaClient | Prisma.TransactionClient,
  customerId: string,
) {
  const references = await client.$queryRaw<CustomerReference[]>(Prisma.sql`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'Customer'
      AND REFERENCED_COLUMN_NAME = 'id'
  `);

  for (const reference of references) {
    const table = Prisma.raw(quoteIdentifier(reference.tableName));
    const column = Prisma.raw(quoteIdentifier(reference.columnName));
    const matchingRows = await client.$queryRaw<Array<{ found: number }>>(Prisma.sql`
      SELECT 1 AS found
      FROM ${table}
      WHERE ${column} = ${customerId}
      LIMIT 1
    `);

    if (matchingRows.length > 0) {
      return true;
    }
  }

  return false;
}
