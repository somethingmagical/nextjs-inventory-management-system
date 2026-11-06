export type WarehouseField =
  | "name"
  | "email"
  | "phoneNumber"
  | "country"
  | "city"
  | "zipCode";

export type WarehouseActionState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<WarehouseField, string[]>>;
};

export const initialWarehouseActionState: WarehouseActionState = {
  status: "idle",
  message: "",
};
