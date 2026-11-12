export type SupplierField = "name" | "email" | "phoneNumber" | "country" | "region" | "city" | "zipCode" | "address";

export type SupplierActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<SupplierField, string[]>>;
  createdId?: string;
  createdName?: string;
};

export const initialSupplierActionState: SupplierActionState = {
  status: "idle",
  message: "",
};
