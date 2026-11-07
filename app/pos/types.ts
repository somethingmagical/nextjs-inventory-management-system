export type PosOption = {
  id: string;
  name: string;
};

export type PosProduct = {
  id: string;
  code: string;
  name: string;
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
