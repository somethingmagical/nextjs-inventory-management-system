"use client";

import type { IScannerControls } from "@zxing/browser";
import { Barcode, Camera, CircleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createProductBarcodeReader } from "@/lib/product-barcode-reader";
import useDialogFocus from "./useDialogFocus";

export default function BarcodeScannerDialog({
  onDetected,
  onClose,
  notFoundMessage = "No matching product was found. Adjust the barcode and try again.",
}: {
  onDetected: (code: string) => boolean;
  onClose: () => void;
  notFoundMessage?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  useDialogFocus(dialogRef);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let controls: IScannerControls | null = null;
    let cancelled = false;
    let finished = false;
    const reader = createProductBarcodeReader();

    // Let React Strict Mode's setup/cleanup probe finish before requesting the camera.
    const startupTimer = window.setTimeout(() => {
      if (cancelled) return;

      void reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || cancelled || finished) return;
        if (!onDetectedRef.current(result.getText())) {
          setError(notFoundMessage);
          return;
        }
        finished = true;
        controls?.stop();
      }).then((nextControls) => {
        controls = nextControls;
        if (cancelled || finished) controls.stop();
      }).catch((cameraError: unknown) => {
        if (cancelled) return;
        setError(cameraError instanceof Error
          ? `Could not start the camera: ${cameraError.message}`
          : "Could not start the camera. Check camera permissions and try again.");
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      controls?.stop();
    };
  }, [notFoundMessage]);

  return (
    <div
      className="barcode-scanner-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="gg-modal barcode-scanner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
      >
        <div className="gg-modal-head">
          <div className="barcode-scanner-heading">
            <span><Barcode aria-hidden="true" /></span>
            <div>
              <h2 className="gg-card-title" id="barcode-scanner-title">Scan a barcode</h2>
              <p>Point the camera at the product barcode.</p>
            </div>
          </div>
          <button className="gg-modal-close" type="button" aria-label="Close barcode scanner" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="barcode-scanner-body">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Camera barcode scanning preview" />
          {!error && <p className="barcode-scanner-hint"><Camera aria-hidden="true" />Waiting for a barcode…</p>}
          {error && <p className="barcode-scanner-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
