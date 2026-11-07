export type ExpenseActionField =
  | "date"
  | "title"
  | "warehouseId"
  | "expenseCategoryId"
  | "amount"
  | "details";

export type ExpenseActionState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<ExpenseActionField, string[]>>;
};

export const initialExpenseActionState: ExpenseActionState = {
  status: "idle",
  message: "",
};
