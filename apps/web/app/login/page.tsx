'use client';

// Submits credentials to POST /api/v1/auth/login via useAuth().login()
// (apps/web/src/lib/AuthProvider.tsx), which owns the fetch call and the
// sessionStorage write. This page owns only the form, client-side validation
// and the post-login redirect.

import React, { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@breeyo/validators';
import { useAuth, type ClinicOption } from '../../src/lib/AuthProvider';
import styles from './login.module.css';

interface FieldErrors {
  email?: string;
  password?: string;
}

const GENERIC_FAILURE_MESSAGE = 'Could not sign in. Check your email and password.';

function resolveRedirectTarget(next: string | null): string {
  // `?next=` is only honoured when it is a same-origin relative path
  // beginning with `/` -- an open redirect is the classic bug in exactly this
  // pattern (T-08-23). `startsWith('/')` alone would still accept a
  // protocol-relative `//evil.com`, so that form is rejected too.
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/schedule';
  }
  return next;
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary during static prerendering
  // (Next.js App Router); the fallback never actually renders here since
  // `/login` has no server data dependency, but the boundary is required for
  // the build to statically export the route.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [clinics, setClinics] = useState<ClinicOption[] | null>(null);
  const [clinicId, setClinicId] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = loginSchema.safeParse({
      email: email.trim(),
      password,
      clinicId: clinicId || undefined,
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(parsed.data.email, parsed.data.password, parsed.data.clinicId);

      if (result.success) {
        router.replace(resolveRedirectTarget(searchParams.get('next')));
        return;
      }

      if (result.code === 'CLINIC_SELECTION_REQUIRED' && result.clinics) {
        setClinics(result.clinics);
        setFormError(result.message);
        return;
      }

      // Echo the server's message verbatim for any credential failure -- do
      // not distinguish "no such user" from "wrong password" in the copy
      // (T-08-25). Only a genuine network failure (no server response) gets
      // the generic fallback below.
      setFormError(result.code === 'NETWORK_ERROR' ? GENERIC_FAILURE_MESSAGE : result.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome Back</h1>
        <p className={styles.subtitle}>Sign in to your Breeyo owner portal</p>

        {formError && <p className={styles.formError}>{formError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              className={styles.input}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          {clinics && clinics.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="clinicId">
                Clinic
              </label>
              <select
                id="clinicId"
                name="clinicId"
                className={styles.select}
                required
                value={clinicId}
                onChange={(event) => setClinicId(event.target.value)}
              >
                <option value="" disabled>
                  Select a clinic
                </option>
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className={styles.submit} type="submit" disabled={isSubmitting}>
            Sign In
          </button>
        </form>
      </div>
    </main>
  );
}
