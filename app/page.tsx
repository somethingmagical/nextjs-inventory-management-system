import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInForm from "@/components/auth/SignInForm";

export const instant = false;

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return <SignInForm />;
}
