import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/page';

const schema = z.object({ email: z.email('Enter your school email address.'), password: z.string().min(1, 'Enter your password.') });

export function SignIn() {
  const auth = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'sign_in' | 'reset'>('sign_in');
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const from = (location.state as { from?: string } | null)?.from ?? '/home';

  if (auth.status === 'signed_in') return <Navigate to={from} replace />;

  const submit = form.handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (mode === 'reset') { await auth.sendReset(v.email); setResetSent(true); }
      else await auth.signIn(v.email, v.password);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Sign-in failed.'); }
  });

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1>{mode === 'reset' ? 'Reset your password' : 'Sign in'}</h1>
      <p className="mt-2 text-ink-soft">{mode === 'reset' ? 'We will email you a link to set a new password.' : 'Use the account given to you by the university.'}</p>
      {auth.unavailable && (
        <div className="mt-6"><Notice tone="warning" title="Sign-in is not set up on this site yet">
          The site administrator has not connected CampusServe to its sign-in service. {env.devAuth ? '' : 'Please try again later.'}
        </Notice></div>
      )}
      {resetSent ? (
        <div className="mt-6"><Notice title="Check your email">If an account exists for that address, a reset link is on its way.</Notice></div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="username" inputMode="email" {...form.register('email')} />
          </Field>
          {mode === 'sign_in' && (
            <Field label="Password" error={form.formState.errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...form.register('password')} />
            </Field>
          )}
          {formError && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm font-medium text-danger">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} disabled={auth.unavailable}>
            {mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </Button>
        </form>
      )}
      <Button variant="link" className="mt-4" onClick={() => { setMode(mode === 'reset' ? 'sign_in' : 'reset'); setResetSent(false); form.clearErrors(); }}>
        {mode === 'reset' ? 'Back to sign in' : 'Forgot your password?'}
      </Button>
      <p className="mt-6 text-sm text-ink-faint">No account yet? Accounts are created by the Registrar and SAS. Ask them at the campus.</p>
    </div>
  );
}
