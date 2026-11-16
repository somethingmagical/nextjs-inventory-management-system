import type { CustomerField } from "@/app/(authenticated)/customers/create/action-state";
import type { PosOption } from "./types";

export type PosCustomerActionState =
  | { status: "idle"; message: "" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<CustomerField, string[]>> }
  | { status: "success"; message: string; customer: PosOption };

export const initialPosCustomerActionState: PosCustomerActionState = {
  status: "idle",
  message: "",
};
