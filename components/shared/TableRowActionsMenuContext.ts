"use client";

import { createContext, useContext } from "react";

export const TableRowActionsMenuContext = createContext<() => void>(() => {});

export function useCloseTableRowActionsMenu() {
  return useContext(TableRowActionsMenuContext);
}
