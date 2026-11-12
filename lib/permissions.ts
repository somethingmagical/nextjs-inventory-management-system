export const PERMISSION = {
  viewAdjustments: "View Adjustments",
  manageAdjustments: "Manage Adjustments",
  viewTransfers: "View Transfers",
  manageTransfers: "Manage Transfers",
  viewRoles: "View Roles",
  manageRoles: "Manage Roles",
  viewBrands: "View Brands",
  manageBrands: "Manage Brands",
  manageCurrency: "Manage Currency",
  viewWarehouses: "View Warehouses",
  manageWarehouses: "Manage Warehouses",
  viewStock: "View Stock",
  viewUnits: "View Units",
  manageUnits: "Manage Units",
  viewProductCategories: "View Product Categories",
  manageProductCategories: "Manage Product Categories",
  viewProducts: "View Products",
  manageProducts: "Manage Products",
  viewSuppliers: "View Suppliers",
  manageSuppliers: "Manage Suppliers",
  viewCustomers: "View Customers",
  manageCustomers: "Manage Customers",
  viewUsers: "View Users",
  manageUsers: "Manage Users",
  viewExpenseCategories: "View Expense Categories",
  manageExpenseCategories: "Manage Expense Categories",
  viewExpenses: "View Expenses",
  manageExpenses: "Manage Expenses",
  manageSetting: "Manage Setting",
  viewDashboard: "View Dashboard",
  manageDashboard: "Manage Dashboard",
  managePosScreen: "Manage Pos Screen",
  viewPurchases: "View Purchase",
  managePurchase: "Manage Purchase",
  viewSales: "View Sale",
  manageSale: "Manage Sale",
  viewPurchaseReturns: "View Purchase Return",
  managePurchaseReturn: "Manage Purchase Return",
  viewSaleReturns: "View Sale Return",
  manageSaleReturn: "Manage Sale Return",
  manageEmailTemplates: "Manage Email Templates",
  viewReports: "View Reports",
  manageReports: "Manage Reports",
  manageQuotations: "Manage Quotations",
  manageSmsTemplates: "Manage Sms Templates",
  manageSmsApis: "Manage Sms Apis",
  manageLanguage: "Manage Language",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const PERMISSION_PAIRS = [
  [PERMISSION.viewAdjustments, PERMISSION.manageAdjustments],
  [PERMISSION.viewTransfers, PERMISSION.manageTransfers],
  [PERMISSION.viewRoles, PERMISSION.manageRoles],
  [PERMISSION.viewBrands, PERMISSION.manageBrands],
  [PERMISSION.viewWarehouses, PERMISSION.manageWarehouses],
  [PERMISSION.viewUnits, PERMISSION.manageUnits],
  [PERMISSION.viewProductCategories, PERMISSION.manageProductCategories],
  [PERMISSION.viewProducts, PERMISSION.manageProducts],
  [PERMISSION.viewSuppliers, PERMISSION.manageSuppliers],
  [PERMISSION.viewCustomers, PERMISSION.manageCustomers],
  [PERMISSION.viewUsers, PERMISSION.manageUsers],
  [PERMISSION.viewExpenseCategories, PERMISSION.manageExpenseCategories],
  [PERMISSION.viewExpenses, PERMISSION.manageExpenses],
  [PERMISSION.viewDashboard, PERMISSION.manageDashboard],
  [PERMISSION.viewPurchases, PERMISSION.managePurchase],
  [PERMISSION.viewSales, PERMISSION.manageSale],
  [PERMISSION.viewPurchaseReturns, PERMISSION.managePurchaseReturn],
  [PERMISSION.viewSaleReturns, PERMISSION.manageSaleReturn],
  [PERMISSION.viewReports, PERMISSION.manageReports],
] as const satisfies readonly (readonly [Permission, Permission])[];

const viewPermissionByManage = new Map<string, Permission>(
  PERMISSION_PAIRS.map(([viewPermission, managePermission]) => [managePermission, viewPermission]),
);
const managePermissionByView = new Map<string, Permission>(
  PERMISSION_PAIRS.map(([viewPermission, managePermission]) => [viewPermission, managePermission]),
);

export const PERMISSIONS: readonly Permission[] = Object.values(PERMISSION);

export function withImpliedViewPermissions(permissions: readonly string[]): Permission[] {
  const effective = new Set(permissions.filter((permission): permission is Permission =>
    (PERMISSIONS as readonly string[]).includes(permission),
  ));
  for (const permission of permissions) {
    const viewPermission = viewPermissionByManage.get(permission);
    if (viewPermission) effective.add(viewPermission);
  }
  return PERMISSIONS.filter((permission) => effective.has(permission));
}

export function permissionIsGranted(
  assignedPermissions: readonly string[],
  requiredPermission: Permission,
): boolean {
  if (assignedPermissions.includes(requiredPermission)) return true;
  const managePermission = managePermissionByView.get(requiredPermission);
  return managePermission !== undefined && assignedPermissions.includes(managePermission);
}

export function getViewPermission(managePermission: string): Permission | undefined {
  return viewPermissionByManage.get(managePermission);
}

export const PERMISSION_CATEGORIES = [
  {
    label: "Dashboard & Reports",
    permissions: [
      PERMISSION.viewDashboard,
      PERMISSION.manageDashboard,
      PERMISSION.viewReports,
      PERMISSION.manageReports,
    ],
  },
  {
    label: "Inventory",
    permissions: [
      PERMISSION.viewProducts,
      PERMISSION.manageProducts,
      PERMISSION.viewProductCategories,
      PERMISSION.manageProductCategories,
      PERMISSION.viewBrands,
      PERMISSION.manageBrands,
      PERMISSION.viewUnits,
      PERMISSION.manageUnits,
      PERMISSION.viewWarehouses,
      PERMISSION.manageWarehouses,
      PERMISSION.viewStock,
      PERMISSION.viewAdjustments,
      PERMISSION.manageAdjustments,
      PERMISSION.viewTransfers,
      PERMISSION.manageTransfers,
    ],
  },
  {
    label: "Purchases & Sales",
    permissions: [
      PERMISSION.viewPurchases,
      PERMISSION.managePurchase,
      PERMISSION.viewPurchaseReturns,
      PERMISSION.managePurchaseReturn,
      PERMISSION.viewSales,
      PERMISSION.manageSale,
      PERMISSION.viewSaleReturns,
      PERMISSION.manageSaleReturn,
      PERMISSION.manageQuotations,
    ],
  },
  {
    label: "People & Access",
    permissions: [
      PERMISSION.viewCustomers,
      PERMISSION.manageCustomers,
      PERMISSION.viewSuppliers,
      PERMISSION.manageSuppliers,
      PERMISSION.viewUsers,
      PERMISSION.manageUsers,
      PERMISSION.viewRoles,
      PERMISSION.manageRoles,
    ],
  },
  {
    label: "Expenses",
    permissions: [
      PERMISSION.viewExpenses,
      PERMISSION.manageExpenses,
      PERMISSION.viewExpenseCategories,
      PERMISSION.manageExpenseCategories,
    ],
  },
  {
    label: "Point of Sale",
    permissions: [PERMISSION.managePosScreen],
  },
  {
    label: "Settings & Localization",
    permissions: [
      PERMISSION.manageSetting,
      PERMISSION.manageCurrency,
      PERMISSION.manageLanguage,
    ],
  },
  {
    label: "Communications",
    permissions: [
      PERMISSION.manageEmailTemplates,
      PERMISSION.manageSmsTemplates,
      PERMISSION.manageSmsApis,
    ],
  },
] as const satisfies readonly {
  label: string;
  permissions: readonly Permission[];
}[];
