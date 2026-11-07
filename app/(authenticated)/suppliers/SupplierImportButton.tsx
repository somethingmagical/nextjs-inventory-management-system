"use client";

import { useEffect, useState } from "react";
import { Info, Upload } from "lucide-react";

export default function SupplierImportButton() {
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!showToast) return;

    const timeout = window.setTimeout(() => setShowToast(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [showToast]);

  return (
    <>
      <button className="gg-btn gg-btn--secondary" type="button" onClick={() => setShowToast(true)}>
        <Upload aria-hidden="true" />
        Import Suppliers
      </button>
      {showToast && (
        <p className="warehouse-toast warehouse-toast-success is-visible" role="status">
          <Info size={18} aria-hidden="true" />
          <span>Supplier import will be available soon.</span>
        </p>
      )}
    </>
  );
}
