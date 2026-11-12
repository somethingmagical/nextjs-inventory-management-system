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
