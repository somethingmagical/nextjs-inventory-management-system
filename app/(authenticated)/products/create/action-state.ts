import type { ProductFormValues } from "../product-schema";

export type ProductField = keyof ProductFormValues;

export type ProductActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<ProductField | "images", string[]>>;
};

export const initialProductActionState: ProductActionState = {
  status: "idle",
  message: "",
};
