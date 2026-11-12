"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Info } from "lucide-react";
import {
  initialCustomerActionState,
  type CustomerActionState,
  type CustomerField,
} from "./action-state";
import type { CustomerValues } from "../customer-schema";
import { useRetainedFormValues } from "@/components/shared/useRetainedFormValues";
import { CountryCityFields, PhoneNumberInput } from "@/components/shared/GeographyFields";

type CustomerFormAction = (
  state: CustomerActionState,
  formData: FormData,
) => Promise<CustomerActionState>;

const fields: {
  name: Exclude<CustomerField, "dateOfBirth" | "address" | "country" | "region" | "city" | "zipCode">;
  label: string;
  placeholder: string;
  autoComplete: string;
  maxLength: number;
}[] = [
  { name: "name", label: "Name", placeholder: "Enter Name", autoComplete: "name", maxLength: 120 },
  { name: "email", label: "Email", placeholder: "Enter Email", autoComplete: "email", maxLength: 191 },
  { name: "phoneNumber", label: "Phone Number", placeholder: "Enter Phone Number", autoComplete: "tel", maxLength: 40 },
];

export default function CustomerForm({
  mode,
  action,
  initialValues,
}: {
  mode: "create" | "edit";
  action: CustomerFormAction;
  initialValues?: CustomerValues;
}) {
  const [state, formAction, isPending] = useActionState<CustomerActionState, FormData>(
    action,
    initialCustomerActionState,
  );
  const { formRef, retainValues } = useRetainedFormValues(state, state.status === "error");
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [phoneCountrySelection, setPhoneCountrySelection] = useState<{
    countryCode: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    if (state.status !== "error") {
      setShowToast(false);
      setToastVisible(false);
      return;
    }

    setShowToast(true);
    setToastVisible(true);
    const hideTimeout = window.setTimeout(() => setToastVisible(false), 5000);
    const removeTimeout = window.setTimeout(() => setShowToast(false), 5300);
    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, [state]);

  function fieldError(field: CustomerField) {
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{mode === "create" ? "Create Customer" : "Edit Customer"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/customers">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form ref={formRef} onSubmit={retainValues} className="gg-card gg-card-pad" action={formAction} noValidate>
        <div className="exp-grid">
          {fields.slice(0, 3).map(({ name, label, placeholder, autoComplete, maxLength }) => {
            const error = fieldError(name);
            if (name === "phoneNumber") {
              return (
                <PhoneNumberInput
                  key={name}
                  defaultValue={initialValues?.phoneNumber ?? ""}
                  error={error}
                  disabled={isPending}
                  required
                  countryCode={countryCode}
                  onCountryCodeChange={(nextCountryCode) => {
                    setPhoneCountrySelection((current) => ({
                      countryCode: nextCountryCode,
                      version: (current?.version ?? 0) + 1,
                    }));
                  }}
                />
              );
            }

            return (
              <div className="gg-field" key={name}>
                <label className="gg-label" htmlFor={name}>
                  {label} <span className="gg-req">*</span>
                </label>
                <input
                  className="gg-input"
                  id={name}
                  name={name}
                  type={name === "email" ? "email" : "text"}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  maxLength={maxLength}
                  defaultValue={initialValues?.[name] ?? ""}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${name}-error` : undefined}
                  disabled={isPending}
                />
                {error && <span className="warehouse-field-error" id={`${name}-error`}>{error}</span>}
              </div>
            );
          })}

          <div className="gg-field">
            <label className="gg-label" htmlFor="dateOfBirth">DOB</label>
            <div className="date-field">
              <input
                className="gg-input gg-num"
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                autoComplete="bday"
                defaultValue={initialValues?.dateOfBirth ?? ""}
                aria-invalid={Boolean(fieldError("dateOfBirth"))}
                aria-describedby={fieldError("dateOfBirth") ? "dateOfBirth-error" : undefined}
                disabled={isPending}
              />
              <CalendarDays aria-hidden="true" />
            </div>
            {fieldError("dateOfBirth") && (
              <span className="warehouse-field-error" id="dateOfBirth-error">{fieldError("dateOfBirth")}</span>
            )}
          </div>

          <CountryCityFields
            initialCountry={initialValues?.country}
            initialRegion={initialValues?.region}
            initialCity={initialValues?.city}
            initialPostalCode={initialValues?.zipCode}
            countryError={fieldError("country")}
            regionError={fieldError("region")}
            cityError={fieldError("city")}
            postalError={fieldError("zipCode")}
            disabled={isPending}
            showRegion
            showPostalCode
            onCountryCodeChange={setCountryCode}
            phoneCountrySelection={phoneCountrySelection}
          />

          <div className="gg-field">
            <label className="gg-label" htmlFor="address">
              Address <span className="gg-req">*</span>
            </label>
            <textarea
              className="gg-textarea"
              id="address"
              name="address"
              placeholder="Enter Address"
              maxLength={191}
              defaultValue={initialValues?.address ?? ""}
              aria-invalid={Boolean(fieldError("address"))}
              aria-describedby={fieldError("address") ? "address-error" : undefined}
              disabled={isPending}
              style={{ minHeight: 120 }}
            />
            {fieldError("address") && (
              <span className="warehouse-field-error" id="address-error">{fieldError("address")}</span>
            )}
          </div>
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? (mode === "create" ? "Saving..." : "Updating...") : (mode === "create" ? "Save" : "Update")}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/customers" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>
      </form>

      {state.status === "error" && showToast && (
        <p
          className={`warehouse-toast${toastVisible ? " is-visible" : ""}`}
          role="alert"
          aria-hidden={!toastVisible}
        >
          <Info size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
    </main>
  );
}
