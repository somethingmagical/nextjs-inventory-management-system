"use client";

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";

type FormControlSnapshot =
  | { type: "input"; value: string; checked: boolean; inputType: string; files: File[] }
  | { type: "select"; values: string[] }
  | { type: "textarea"; value: string };

function getControls(form: HTMLFormElement) {
  return Array.from(form.elements).filter(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement,
  );
}

export function useRetainedFormValues(state: unknown, hasError: boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const valuesRef = useRef<FormControlSnapshot[]>([]);

  function retainValues(event: FormEvent<HTMLFormElement>) {
    valuesRef.current = getControls(event.currentTarget).map((control) => {
      if (control instanceof HTMLInputElement) {
        return {
          type: "input",
          value: control.type === "file" ? "" : control.value,
          checked: control.checked,
          inputType: control.type,
          files: Array.from(control.files ?? []),
        };
      }

      if (control instanceof HTMLSelectElement) {
        return {
          type: "select",
          values: Array.from(control.selectedOptions, (option) => option.value),
        };
      }

      return { type: "textarea", value: control.value };
    });
  }

  useEffect(() => {
    if (!hasError || valuesRef.current.length === 0) return;

    const timeout = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;

      const controls = getControls(form);
      valuesRef.current.forEach((snapshot, index) => {
        const control = controls[index];
        if (!control) return;

        if (snapshot.type === "input" && control instanceof HTMLInputElement) {
          if (snapshot.inputType === "file") {
            const transfer = new DataTransfer();
            snapshot.files.forEach((file) => transfer.items.add(file));
            control.files = transfer.files;
          } else {
            control.value = snapshot.value;
          }
          if (snapshot.inputType === "checkbox" || snapshot.inputType === "radio") {
            control.checked = snapshot.checked;
          }
        } else if (snapshot.type === "select" && control instanceof HTMLSelectElement) {
          const selectedValues = new Set(snapshot.values);
          for (const option of Array.from(control.options)) {
            option.selected = selectedValues.has(option.value);
          }
        } else if (snapshot.type === "textarea" && control instanceof HTMLTextAreaElement) {
          control.value = snapshot.value;
        }
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [hasError, state]);

  return { formRef, retainValues };
}
