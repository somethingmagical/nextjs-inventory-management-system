import { auth } from "@/auth";
import RouteSpinner from "@/components/layout/RouteSpinner";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import SignInForm from "@/components/auth/SignInForm";
import { getApplicationSettings } from "@/features/settings/application";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content gg-route-loading" aria-busy="true">
          <RouteSpinner />
        </main>
      }
    >
      <SignInContent />
    </Suspense>
  );
}

async function SignInContent() {
  await connection();
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  const { headerLogoPath } = await getApplicationSettings();
  return <SignInForm headerLogoPath={headerLogoPath} />;
}
