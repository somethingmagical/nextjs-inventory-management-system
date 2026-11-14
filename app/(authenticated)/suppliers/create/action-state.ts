export type SupplierField = "name" | "email" | "phoneNumber" | "country" | "region" | "city" | "suburb" | "zipCode" | "address" | "addressData";

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
