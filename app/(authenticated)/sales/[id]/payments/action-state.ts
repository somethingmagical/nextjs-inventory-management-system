export type SalePaymentActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialSalePaymentActionState: SalePaymentActionState = {
  status: "idle",
  message: "",
};
