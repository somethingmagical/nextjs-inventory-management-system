"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { initialRoleActionState, type RoleActionState } from "./action-state";

type RoleFormAction = (
  state: RoleActionState,
  formData: FormData,
) => Promise<RoleActionState>;

export default function RoleForm({
  mode,
  action,
  initialName = "",
  initialPermissions = [],
  availablePermissions = PERMISSIONS,
}: {
  mode: "create" | "edit";
  action: RoleFormAction;
  initialName?: string;
  initialPermissions?: string[];
  availablePermissions?: readonly Permission[];
}) {
  const [state, formAction, isPending] = useActionState<RoleActionState, FormData>(
    action,
    initialRoleActionState,
  );
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(initialPermissions);
  const allSelected = availablePermissions.every((permission) => selectedPermissions.includes(permission));

  function toggleAll(checked: boolean) {
    setSelectedPermissions(checked ? [...availablePermissions] : []);
  }

  function togglePermission(permission: string, checked: boolean) {
    setSelectedPermissions((current) =>
      checked
        ? [...current, permission]
        : current.filter((selected) => selected !== permission),
    );
  }

  const nameError = state.fieldErrors?.name?.[0];
  const permissionsError = state.fieldErrors?.permissions?.[0];

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{mode === "create" ? "Create Role" : "Edit Role"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/roles">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad" action={formAction} noValidate>
        <div className="gg-field">
          <label className="gg-label" htmlFor="role-name">
            Name <span className="gg-req">*</span>
          </label>
          <input
            className="gg-input"
            id="role-name"
            name="name"
            placeholder="Enter Name"
            defaultValue={initialName}
            maxLength={80}
            required
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "role-name-error" : undefined}
            disabled={isPending}
          />
          {nameError && <span className="profile-field-error" id="role-name-error">{nameError}</span>}
        </div>

        <section className="role-permission-section" aria-labelledby="role-permissions-label">
          <div className="role-permission-head">
            <span className="gg-label" id="role-permissions-label">
              Permissions <span className="gg-req">*</span>
            </span>
            <label className="role-permission-item role-permission-all">
              <input
                className="gg-check"
                type="checkbox"
                checked={allSelected}
                onChange={(event) => toggleAll(event.currentTarget.checked)}
                disabled={isPending}
              />
              <span>All Permissions</span>
            </label>
          </div>

          <div
            className="role-permission-grid"
            aria-describedby={permissionsError ? "role-permissions-error" : undefined}
          >
            {availablePermissions.map((permission) => (
              <label className="role-permission-item" key={permission}>
                <input
                  className="gg-check"
                  type="checkbox"
                  name="permissions"
                  value={permission}
                  checked={selectedPermissions.includes(permission)}
                  onChange={(event) => togglePermission(permission, event.currentTarget.checked)}
                  disabled={isPending}
                />
                <span>{permission}</span>
              </label>
            ))}
          </div>
          {permissionsError && (
            <span className="profile-field-error" id="role-permissions-error">{permissionsError}</span>
          )}
        </section>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? (mode === "create" ? "Creating..." : "Updating...") : "Save"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/roles" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>

        {state.status === "error" && (
          <p className="profile-alert" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
      </form>
    </main>
  );
}
