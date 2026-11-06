export type MasterDataField = "name" | "logo";

export type MasterDataActionState = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<MasterDataField, string[]>>;
};

export type MasterDataItem = {
  id: string;
  name: string;
  logo: string | null;
};

export type MasterDataAction = (formData: FormData) => Promise<MasterDataActionState>;
