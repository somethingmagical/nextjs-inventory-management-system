"use client";

import { useEffect, useState } from "react";
import { Download, Filter, Info, Upload } from "lucide-react";

export default function ProductListTools() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  return (
    <>
      <button
        className="gg-icon-btn product-filter-button"
        type="button"
        aria-label="Filter products"
        title="Filter products"
        onClick={() => setMessage("Product filters are coming soon.")}
      >
        <Filter aria-hidden="true" />
      </button>
      <button
        className="gg-btn gg-btn--secondary"
        type="button"
        onClick={() => setMessage("Product export is coming soon.")}
      >
        <Upload aria-hidden="true" />
        Export Products
      </button>
      <button
        className="gg-btn gg-btn--secondary"
        type="button"
        onClick={() => setMessage("Product import is coming soon.")}
      >
        <Download aria-hidden="true" />
        Import Products
      </button>
      {message && (
        <p className="warehouse-toast is-visible product-tools-toast" role="status">
          <Info size={18} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </>
  );
}
