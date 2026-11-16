'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { verifyEmail, resendVerification, saveAccount } from '../../../lib/api';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenParam = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';
  const codeParam = searchParams.get('code') || '';

  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState(codeParam);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Auto-verify if token is provided in the URL query
  useEffect(() => {
    if (tokenParam && emailParam) {
      setIsVerifying(true);
      setError('');
      verifyEmail({ token: tokenParam, email: emailParam })
        .then((result) => {
          setIsSuccess(true);
          if (result.user && result.accessToken) {
            saveAccount(result.user, result.accessToken);
          }
          setTimeout(() => {
            router.replace('/dashboard');
          }, 1500);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Verification link is invalid or expired.');
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [tokenParam, emailParam, router]);

  async function handleManualVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !code.trim()) {
      setError('Please provide both your email and the 6-digit verification code.');
      return;
    }
    setError('');
    setIsVerifying(true);
    try {
      const result = await verifyEmail({ email: email.trim(), code: code.trim() });
      setIsSuccess(true);
      if (result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
      }
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify email. Please check your code.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !email.trim()) return;
    setError('');
    setMessage('');
    try {
      const res = await resendVerification({ email: email.trim() });
      setMessage(res.message || 'A new verification code has been dispatched to your email.');
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code');
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(23,166,107,0.18),transparent_28%),linear-gradient(180deg,#f4f7f7_0%,#eef4f1_100%)] px-4 py-10 text-ink-900 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="cash-card p-6 sm:p-8 bg-white shadow-card">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-ink-900">Email Verified!</h2>
              <p className="text-sm text-ink-500">
                Your CashFlow account is now active. Redirecting you to your dashboard...
              </p>
            </div>
          ) : isVerifying && tokenParam ? (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
              <h2 className="text-xl font-semibold text-ink-900">Verifying your email...</h2>
              <p className="text-sm text-ink-500">Please wait while we confirm your account.</p>
            </div>
          ) : (
            <div>
              <div className="mb-6 space-y-2 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Account Activation</span>
                </div>
                <h1 className="text-2xl font-bold text-ink-900">Verify Your Email</h1>
                <p className="text-sm text-ink-500">
                  Enter your email and the 6-digit code received in your inbox.
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800">
                  {message}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleManualVerify}>
                <div>
                  <label className="cash-label" htmlFor="verify-email-input">
                    Email address
                  </label>
                  <input
                    id="verify-email-input"
                    type="email"
                    className="cash-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@cashflow.app"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="cash-label" htmlFor="verify-code-input">
                      6-Digit Verification Code
                    </label>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={cooldown > 0 || !email.trim()}
                      className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 disabled:cursor-not-allowed transition"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </div>
                  <input
                    id="verify-code-input"
                    type="text"
                    className="cash-input text-center text-2xl tracking-widest font-mono font-bold"
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="cash-button-primary w-full"
                  disabled={isVerifying}
                >
                  {isVerifying ? 'Verifying...' : 'Verify Email Address'}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-ink-500">
                Already verified?{' '}
                <Link className="font-semibold text-brand-700 hover:text-brand-800" href="/login">
                  Sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

