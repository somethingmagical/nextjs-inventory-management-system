export type PurchaseReturnCreateActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialPurchaseReturnCreateActionState: PurchaseReturnCreateActionState = {
  status: "idle",
  message: "",
};
