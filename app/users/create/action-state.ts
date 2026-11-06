export type UserField =
  | "firstName"
  | "lastName"
  | "email"
  | "phoneNumber"
  | "role"
  | "password"
  | "confirmPassword"
  | "image";

export type UserActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<UserField, string[]>>;
};

export const initialUserActionState: UserActionState = {
  status: "idle",
  message: "",
};
