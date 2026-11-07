export type PurchaseCreateActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialPurchaseCreateActionState: PurchaseCreateActionState = {
  status: "idle",
  message: "",
};
