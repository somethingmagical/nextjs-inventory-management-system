export type WarehouseField =
  | "name"
  | "email"
  | "phoneNumber"
  | "address"
  | "country"
  | "city"
  | "region"
  | "zipCode";

export type WarehouseActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<WarehouseField, string[]>>;
  createdId?: string;
  createdName?: string;
};

export const initialWarehouseActionState: WarehouseActionState = {
  status: "idle",
  message: "",
};
