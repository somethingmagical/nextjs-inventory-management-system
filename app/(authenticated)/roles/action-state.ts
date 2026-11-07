export type RoleField = "name" | "permissions";

export type RoleActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<RoleField, string[]>>;
};

export const initialRoleActionState: RoleActionState = {
  status: "idle",
  message: "",
};
