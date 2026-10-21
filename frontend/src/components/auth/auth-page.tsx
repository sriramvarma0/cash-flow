'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  login,
  verify2faLogin,
  register,
  saveAccount,
  getSavedAccounts,
  removeSavedAccount,
  clearAllSavedAccounts,
  switchAccount,
  type SavedAccount
} from '../../lib/api';

const copy = {
  login: {
    eyebrow: 'Welcome back',
    title: 'Sign in to CashFlow',
    subtitle: 'See your spending, update transactions, and keep your finances in one place.',
    submit: 'Sign in',
    footer: 'Need an account?',
    footerLink: '/register',
    footerLinkLabel: 'Create one'
  },
  register: {
    eyebrow: 'Get started',
    title: 'Create your CashFlow account',
    subtitle: 'Track expenses, monitor categories, and build a cleaner money routine.',
    submit: 'Create account',
    footer: 'Already registered?',
    footerLink: '/login',
    footerLinkLabel: 'Sign in'
  }
} as const;

export function AuthPage({ mode, nextPath }: { mode: 'login' | 'register'; nextPath: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  // 2FA Challenge state
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorPendingToken, setTwoFactorPendingToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('addAccount') === 'true') {
        setShowForm(true);
      }
    }
  }, []);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await register({ name, email, phoneNumber, password });
      if (result && result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
      }
      router.replace(nextPath as never);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete registration');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Login handler with 2FA interception
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      if (result.requires2FA && result.tempToken) {
        setTwoFactorPendingToken(result.tempToken);
        setTwoFactorRequired(true);
        setError('');
        setIsSubmitting(false);
        return;
      }

      if (result && result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
      }
      router.replace(nextPath as never);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 2FA verification submission
  async function handleVerify2fa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!twoFactorPendingToken || !twoFactorCode.trim()) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await verify2faLogin(twoFactorPendingToken, twoFactorCode.trim());
      if (result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
        router.replace(nextPath as never);
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Invalid 2FA code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleAccountClick = async (acc: SavedAccount) => {
    setError('');
    setIsSubmitting(true);
    try {
      await switchAccount(acc.accessToken);
      router.replace(nextPath as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAccount = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedAccount(id);
    setSavedAccounts(getSavedAccounts());
  };

  const getInitials = (nameStr: string) => {
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return nameStr.slice(0, 2).toUpperCase();
  };

  const activeCopy = copy[mode];

  const renderChooseAccount = () => (
    <div className="cash-card p-6 sm:p-8 bg-white">
      <div className="mb-6 space-y-2">
        <h2 className="text-3xl font-semibold text-ink-900">Choose an account</h2>
        <p className="text-sm text-ink-500">to continue to CashFlow</p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="divide-y divide-ink-100 border border-ink-150 rounded-2xl bg-white overflow-hidden mb-6 shadow-xxs">
        {savedAccounts.map((acc) => (
          <div
            key={acc.id}
            onClick={() => void handleAccountClick(acc)}
            className="flex items-center justify-between p-4 hover:bg-ink-50 cursor-pointer transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800 text-sm font-bold border border-brand-200 shadow-xxs">
                {getInitials(acc.name)}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-ink-900 leading-tight">{acc.name}</p>
                <p className="text-xs text-ink-500 leading-tight mt-0.5">{acc.email}</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={(e) => handleRemoveAccount(acc.id, e)}
              className="p-1.5 rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Remove account from this browser"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setShowForm(true)}
          className="cash-button-secondary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Use another account</span>
        </button>

        <button
          onClick={() => {
            clearAllSavedAccounts();
            setSavedAccounts([]);
          }}
          className="w-full text-center text-xs text-ink-500 hover:text-ink-800 py-1 transition font-medium"
        >
          Clear all saved accounts
        </button>
      </div>

      <div className="mt-8 pt-4 border-t border-ink-100 text-sm text-ink-500">
        New to CashFlow?{' '}
        <Link className="font-semibold text-brand-700 hover:text-brand-800" href={`/register?next=${encodeURIComponent(nextPath)}`}>
          Create account
        </Link>
      </div>
    </div>
  );

  const isChooseAccountVisible = savedAccounts.length > 0 && !showForm && mode === 'login';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(23,166,107,0.18),transparent_28%),linear-gradient(180deg,#f4f7f7_0%,#eef4f1_100%)] px-4 py-10 text-ink-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6 text-balance">
          <p className="inline-flex rounded-full border border-brand-200 bg-white/70 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm backdrop-blur">
            {activeCopy.eyebrow}
          </p>
          <div className="space-y-4">
            <h1 className="font-display text-5xl font-semibold tracking-tight text-ink-900 sm:text-6xl">
              {activeCopy.title}
            </h1>
            <p className="max-w-xl text-lg leading-8 text-ink-600">{activeCopy.subtitle}</p>
          </div>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
            {['Account Security', 'JWT Authentication', 'Dashboard Insights'].map((item) => (
              <div key={item} className="cash-card p-4">
                <p className="text-sm font-semibold text-ink-900">{item}</p>
                <p className="mt-2 text-sm leading-6 text-ink-500">
                  Built with verified security, modular services, and clean mobile flows.
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          {twoFactorRequired ? (
            <div className="cash-card p-6 sm:p-8 bg-white shadow-card">
              <div className="mb-6 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Two-Factor Authentication</span>
                </div>
                <h2 className="text-3xl font-semibold text-ink-900">
                  {useBackupCode ? 'Enter Backup Code' : 'Two-Factor Challenge'}
                </h2>
                <p className="text-sm text-ink-500">
                  {useBackupCode
                    ? 'Enter one of your emergency recovery codes (format: XXXXX-XXXXX).'
                    : 'Open your Authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.) and enter the 6-digit code.'}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleVerify2fa}>
                <div>
                  <label className="cash-label" htmlFor="twoFactorCode">
                    {useBackupCode ? 'Recovery Code' : '6-Digit Verification Code'}
                  </label>
                  <input
                    id="twoFactorCode"
                    type="text"
                    className="cash-input text-center text-2xl tracking-widest font-mono font-bold"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase())}
                    placeholder={useBackupCode ? 'XXXXX-XXXXX' : '000000'}
                    maxLength={useBackupCode ? 15 : 6}
                    autoFocus
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button type="submit" className="cash-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
                </button>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(!useBackupCode);
                      setTwoFactorCode('');
                      setError('');
                    }}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition"
                  >
                    {useBackupCode ? '← Use 6-digit Authenticator code' : 'Use emergency recovery code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorRequired(false);
                      setTwoFactorPendingToken('');
                      setTwoFactorCode('');
                      setError('');
                    }}
                    className="text-xs font-medium text-ink-500 hover:text-ink-800 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : isChooseAccountVisible ? (
            renderChooseAccount()
          ) : (
            <div className="cash-card p-6 sm:p-8 bg-white">
              <div className="mb-6 space-y-2">
                <h2 className="text-3xl font-semibold text-ink-900">
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </h2>
                <p className="text-sm text-ink-500">
                  {mode === 'login'
                    ? 'Use your email and password to continue.'
                    : 'Enter your details to create your account.'}
                </p>
              </div>

              {/* LOGIN FORM */}
              {mode === 'login' && (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div>
                    <label className="cash-label" htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="cash-input"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="alex@cashflow.app"
                      required
                    />
                  </div>

                  <div>
                    <label className="cash-label" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      className="cash-input"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                    />
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button type="submit" className="cash-button-primary w-full" disabled={isSubmitting}>
                    {isSubmitting ? 'Working...' : 'Sign in'}
                  </button>
                </form>
              )}

              {/* REGISTER FORM */}
              {mode === 'register' && (
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div>
                    <label className="cash-label" htmlFor="name">
                      Full name
                    </label>
                    <input
                      id="name"
                      className="cash-input"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Alex Johnson"
                      required
                    />
                  </div>

                  <div>
                    <label className="cash-label" htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="cash-input"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="alex@cashflow.app"
                      required
                    />
                  </div>

                  <div>
                    <label className="cash-label" htmlFor="phoneNumber">
                      Phone number
                    </label>
                    <input
                      id="phoneNumber"
                      type="tel"
                      className="cash-input"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="+1 555 123 4567"
                      required
                    />
                  </div>

                  <div>
                    <label className="cash-label" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      className="cash-input"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                    />
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button type="submit" className="cash-button-primary w-full" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating account...' : activeCopy.submit}
                  </button>
                </form>
              )}

              <div className="mt-6 flex flex-col gap-2.5">
                <div className="text-sm text-ink-500">
                  {activeCopy.footer}{' '}
                  <Link className="font-semibold text-brand-700 hover:text-brand-800" href={`${activeCopy.footerLink}?next=${encodeURIComponent(nextPath)}`}>
                    {activeCopy.footerLinkLabel}
                  </Link>
                </div>
                {savedAccounts.length > 0 && mode === 'login' && (
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-left text-xs font-semibold text-brand-700 hover:text-brand-800 transition"
                  >
                    ← Back to Choose Account
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
