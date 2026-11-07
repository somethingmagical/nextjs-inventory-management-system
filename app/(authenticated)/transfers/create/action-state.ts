export type TransferCreateActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialTransferCreateActionState: TransferCreateActionState = {
  status: "idle",
  message: "",
};
