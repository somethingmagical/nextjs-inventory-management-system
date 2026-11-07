export type AdjustmentActionState = {
  status: "idle" | "error";
  message: string;
};

export const initialAdjustmentActionState: AdjustmentActionState = {
  status: "idle",
  message: "",
};
