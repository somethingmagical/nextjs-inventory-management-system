"use client";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth">
        <div className="auth-ava" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="8" r="5" />
          </svg>
        </div>
        <section className="auth-card" aria-labelledby="sign-in-title">
          <h1 className="auth-title" id="sign-in-title">Sign In</h1>
          <form onSubmit={(event) => event.preventDefault()}>
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
            <button className="auth-btn" type="submit">Login</button>
          </form>
        </section>
      </div>
    </main>
  );
}
