"use client";

import { signIn } from "next-auth/react";
import { Info, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export default function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const credentials = credentialsSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!credentials.success) {
      setError(
        credentials.error.issues[0]?.path[0] === "email"
          ? "Please enter a valid email address."
          : "Please enter your password.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email: credentials.data.email,
        password: credentials.data.password,
        redirect: false,
        redirectTo: "/dashboard",
      });

      if (!result?.ok || result.error) {
        setError("Invalid email or password.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth">
        <div className="auth-ava" aria-hidden="true">
          <UserRound size={36} strokeWidth={1.7} />
        </div>
        <section className="auth-card" aria-labelledby="sign-in-title">
          <h1 className="auth-title" id="sign-in-title">Sign In</h1>
          <form noValidate onSubmit={handleSubmit}>
            {error && (
              <p className="auth-error" role="alert">
                <Info size={18} aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
            <div className="auth-field">
              <div className="auth-label-row">
                <label className="auth-label" htmlFor="email">Email : <span className="req">*</span></label>
              </div>
              <input className="auth-input" id="email" name="email" type="email" autoComplete="email" placeholder="Enter Email" required />
            </div>
            <div className="auth-field">
              <div className="auth-label-row">
                <label className="auth-label" htmlFor="password">Password: <span className="req">*</span></label>
                <a href="#" className="auth-forgot" onClick={(event) => event.preventDefault()}>Forgot Password ?</a>
              </div>
              <input className="auth-input" id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter Password" required />
            </div>
            <button className="auth-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
