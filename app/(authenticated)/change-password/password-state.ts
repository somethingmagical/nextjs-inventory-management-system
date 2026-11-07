export type PasswordActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialPasswordActionState: PasswordActionState = {
  status: "idle",
  message: "",
};
