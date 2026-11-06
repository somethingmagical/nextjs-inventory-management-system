export type SupplierField = "name" | "email" | "phoneNumber" | "country" | "city" | "address";

export type SupplierActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<SupplierField, string[]>>;
};

export const initialSupplierActionState: SupplierActionState = {
  status: "idle",
  message: "",
};
