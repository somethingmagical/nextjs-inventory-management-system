export type ProfileField = "firstName" | "lastName" | "email" | "phoneNumber" | "image";

export type ProfileActionState = {
  status: "idle" | "unchanged" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<ProfileField, string[]>>;
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
};
