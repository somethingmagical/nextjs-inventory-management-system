export type StockQuantityEditActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialStockQuantityEditActionState: StockQuantityEditActionState = {
  status: "idle",
  message: "",
};
