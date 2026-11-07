import { Suspense, type ReactNode } from "react";

export default function ReportPageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="gg-content reports-content" aria-busy="true">
          <p className="gg-muted">Loading report...</p>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
