export const PERMISSION = {
  manageAdjustments: "Manage Adjustments",
  manageTransfers: "Manage Transfers",
  manageRoles: "Manage Roles",
  manageBrands: "Manage Brands",
  manageCurrency: "Manage Currency",
  manageWarehouses: "Manage Warehouses",
  manageUnits: "Manage Units",
  manageProductCategories: "Manage Product Categories",
  manageProducts: "Manage Products",
  manageSuppliers: "Manage Suppliers",
  manageCustomers: "Manage Customers",
  manageUsers: "Manage Users",
  manageExpenseCategories: "Manage Expense Categories",
  manageExpenses: "Manage Expenses",
  manageSetting: "Manage Setting",
  manageDashboard: "Manage Dashboard",
  managePosScreen: "Manage Pos Screen",
  managePurchase: "Manage Purchase",
  manageSale: "Manage Sale",
  managePurchaseReturn: "Manage Purchase Return",
  manageSaleReturn: "Manage Sale Return",
  manageEmailTemplates: "Manage Email Templates",
  manageReports: "Manage Reports",
  manageQuotations: "Manage Quotations",
  manageSmsTemplates: "Manage Sms Templates",
  manageSmsApis: "Manage Sms Apis",
  manageLanguage: "Manage Language",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const PERMISSIONS: readonly Permission[] = Object.values(PERMISSION);
