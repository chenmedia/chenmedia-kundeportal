"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { loginAction, type ActionState } from "../actions";

function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const expired = useSearchParams().get("utlopt");
  return (
    <div className="max-w-md mx-auto card p-8 mt-8">
      <h1 className="display text-2xl">Logg inn</h1>
      {expired && !state.error && <p role="status" className="mt-3 text-sm font-semibold">Innloggingen har utløpt. Logg inn igjen.</p>}
      <form action={action} className="mt-6 grid gap-5">
        <div>
          <label htmlFor="email" className="field-label">E-post</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        </div>
        <div>
          <label htmlFor="password" className="field-label">Passord</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        {state.error && <p role="alert" className="field-error">{state.error}</p>}
        <button className="btn btn-dark" disabled={pending}>{pending ? "Logger inn …" : "Logg inn"}</button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
