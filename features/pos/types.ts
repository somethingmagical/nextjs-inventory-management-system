export type PosProduct = {
  id: string;
  code: string;
  name: string;
  image: string | null;
  price: string;
  stock: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  taxRate: string;
  taxType: "Inclusive" | "Exclusive";
};
