export type SaleReturnCreateActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialSaleReturnCreateActionState: SaleReturnCreateActionState = {
  status: "idle",
  message: "",
};
