export type CustomerField =
  | "name"
  | "email"
  | "phoneNumber"
  | "dateOfBirth"
  | "country"
  | "region"
  | "city"
  | "suburb"
  | "zipCode"
  | "address"
  | "addressData";

export type CustomerActionState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<CustomerField, string[]>>;
};

export const initialCustomerActionState: CustomerActionState = {
  status: "idle",
  message: "",
};
