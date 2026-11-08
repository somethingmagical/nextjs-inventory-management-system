import { auth } from "@/auth";
import RouteSpinner from "@/components/layout/RouteSpinner";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import SignInForm from "@/components/auth/SignInForm";

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

  return <SignInForm />;
}
