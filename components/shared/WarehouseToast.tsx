"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export default function WarehouseToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const hideTimeout = window.setTimeout(() => setVisible(false), 5000);
    const removeTimeout = window.setTimeout(() => setMounted(false), 5300);
    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, []);

  if (!mounted) return null;

  return (
    <p
      className={`warehouse-toast warehouse-toast-success${visible ? " is-visible" : ""}`}
      role="status"
      aria-hidden={!visible}
    >
      <Check size={18} aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
