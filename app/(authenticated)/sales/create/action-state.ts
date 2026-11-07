export type SaleCreateActionState = {
  status: "idle" | "error" | "success";
  message: string;
  saleId?: string;
  reference?: string;
};

export const initialSaleCreateActionState: SaleCreateActionState = {
  status: "idle",
  message: "",
};
