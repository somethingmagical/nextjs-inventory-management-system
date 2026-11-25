import assert from "node:assert/strict";
import test from "node:test";
import {
  getViewPermission,
  PERMISSION,
  permissionIsGranted,
  withImpliedViewPermissions,
} from "./permissions";

test("Manage grants its paired View permission, including for legacy roles", () => {
  assert.deepEqual(
    withImpliedViewPermissions([PERMISSION.manageProducts]),
    [PERMISSION.viewProducts, PERMISSION.manageProducts],
  );
  assert.equal(
    permissionIsGranted([PERMISSION.manageProducts], PERMISSION.viewProducts),
    true,
  );
});

test("View does not grant Manage", () => {
  assert.deepEqual(
    withImpliedViewPermissions([PERMISSION.viewProducts]),
    [PERMISSION.viewProducts],
  );
  assert.equal(
    permissionIsGranted([PERMISSION.viewProducts], PERMISSION.manageProducts),
    false,
  );
});

test("unknown stored permissions are ignored and only paired Manage grants imply View", () => {
  assert.deepEqual(
    withImpliedViewPermissions(["Unknown Permission", PERMISSION.manageSetting]),
    [PERMISSION.manageSetting],
  );
  assert.equal(getViewPermission(PERMISSION.manageProducts), PERMISSION.viewProducts);
  assert.equal(getViewPermission(PERMISSION.manageSetting), undefined);
});

test("editing one's own profile is an explicit standalone permission", () => {
  assert.equal(permissionIsGranted([], PERMISSION.editOwnProfile), false);
  assert.equal(permissionIsGranted([PERMISSION.manageUsers], PERMISSION.editOwnProfile), false);
  assert.equal(permissionIsGranted([PERMISSION.editOwnProfile], PERMISSION.editOwnProfile), true);
});

test("business insights access is separate from dashboard and reports access", () => {
  assert.equal(
    permissionIsGranted([PERMISSION.viewDashboard], PERMISSION.viewBusinessInsights),
    false,
  );
  assert.equal(
    permissionIsGranted([PERMISSION.viewReports], PERMISSION.viewBusinessInsights),
    false,
  );
  assert.equal(
    permissionIsGranted([PERMISSION.viewBusinessInsights], PERMISSION.viewBusinessInsights),
    true,
  );
});
