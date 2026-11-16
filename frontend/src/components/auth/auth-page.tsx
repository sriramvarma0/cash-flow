'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  login,
  verify2faLogin,
  sendLoginEmailOtp,
  register,
  verifyEmail,
  resendVerification,
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

const COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳', sample: '98765 43210' },
  { code: '+1', name: 'US / Canada', flag: '🇺🇸', sample: '202 555 0123' },
  { code: '+44', name: 'UK', flag: '🇬🇧', sample: '7911 123456' },
  { code: '+61', name: 'Australia', flag: '🇦🇺', sample: '412 345 678' },
  { code: '+971', name: 'UAE', flag: '🇦🇪', sample: '50 123 4567' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬', sample: '8123 4567' },
  { code: '+49', name: 'Germany', flag: '🇩🇪', sample: '151 12345678' },
  { code: '+33', name: 'France', flag: '🇫🇷', sample: '6 12 34 56 78' },
  { code: '+81', name: 'Japan', flag: '🇯🇵', sample: '90 1234 5678' },
  { code: '+86', name: 'China', flag: '🇨🇳', sample: '138 0013 8000' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷', sample: '11 91234 5678' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽', sample: '55 1234 5678' },
  { code: '+34', name: 'Spain', flag: '🇪🇸', sample: '612 34 56 78' },
  { code: '+39', name: 'Italy', flag: '🇮🇹', sample: '312 345 6789' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱', sample: '6 12345678' },
  { code: '+41', name: 'Switzerland', flag: '🇨🇭', sample: '78 123 45 67' },
  { code: '+46', name: 'Sweden', flag: '🇸🇪', sample: '70 123 45 67' },
  { code: '+47', name: 'Norway', flag: '🇳🇴', sample: '412 34 567' },
  { code: '+45', name: 'Denmark', flag: '🇩🇰', sample: '20 12 34 56' },
  { code: '+353', name: 'Ireland', flag: '🇮🇪', sample: '83 123 4567' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿', sample: '21 123 4567' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦', sample: '71 123 4567' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬', sample: '802 123 4567' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪', sample: '712 345678' },
  { code: '+20', name: 'Egypt', flag: '🇪🇬', sample: '10 1234 5678' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦', sample: '50 123 4567' },
  { code: '+974', name: 'Qatar', flag: '🇶🇦', sample: '3312 3456' },
  { code: '+965', name: 'Kuwait', flag: '🇰🇼', sample: '9123 4567' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷', sample: '10 1234 5678' },
  { code: '+852', name: 'Hong Kong', flag: '🇭🇰', sample: '9123 4567' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾', sample: '12 345 6789' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩', sample: '812 3456 7890' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭', sample: '917 123 4567' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳', sample: '91 234 5678' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭', sample: '81 234 5678' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰', sample: '300 1234567' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩', sample: '1712 345678' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰', sample: '71 234 5678' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵', sample: '984 1234567' }
];

function getDefaultCountryCode(): string {
  if (typeof window === 'undefined') return '+91';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata')) return '+91';
    if (tz.includes('London')) return '+44';
    if (tz.includes('Australia') || tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Brisbane')) return '+61';
    if (tz.includes('Dubai')) return '+971';
    if (tz.includes('Singapore')) return '+65';
    if (tz.includes('Berlin') || tz.includes('Frankfurt')) return '+49';
    if (tz.includes('Paris')) return '+33';
    if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('Denver') || tz.includes('Toronto')) return '+1';
  } catch {}
  return '+91';
}

function getSamplePlaceholder(dialCode: string): string {
  const match = COUNTRY_CODES.find((c) => c.code === dialCode);
  return match ? match.sample : '98765 43210';
}

function buildFullPhoneNumber(selectedCountryCode: string, inputNumber: string): string {
  const trimmed = (inputNumber || '').trim();
  // If user explicitly typed a leading '+', e.g. '+919876543210' or '+12025550123'
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/[\s()-]/g, '');
  }

  // Strip all non-digit characters
  const cleanDigits = trimmed.replace(/\D/g, '');
  const dialDigits = selectedCountryCode.replace('+', '');

  // If user typed the country dial code without '+' (e.g. '919876543210' with +91 selected)
  if (cleanDigits.startsWith(dialDigits) && cleanDigits.length >= dialDigits.length + 7) {
    return `+${cleanDigits}`;
  }

  // Strip domestic trunk prefix (leading zeros like 07123... or 09876...)
  const localWithoutLeadingZero = cleanDigits.replace(/^0+/, '');
  return `${selectedCountryCode}${localWithoutLeadingZero}`;
}

export function AuthPage({ mode, nextPath }: { mode: 'login' | 'register'; nextPath: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  // 2FA Challenge state
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorPendingToken, setTwoFactorPendingToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFactorAvailableMethods, setTwoFactorAvailableMethods] = useState<('totp' | 'email')[]>([]);
  const [twoFactorActiveMethod, setTwoFactorActiveMethod] = useState<'totp' | 'email'>('totp');
  const [twoFactorMaskedEmail, setTwoFactorMaskedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  // Email Verification state
  const [emailVerifyRequired, setEmailVerifyRequired] = useState(false);
  const [emailVerifyPendingToken, setEmailVerifyPendingToken] = useState('');
  const [emailVerifyTargetEmail, setEmailVerifyTargetEmail] = useState('');
  const [emailVerifyMaskedEmail, setEmailVerifyMaskedEmail] = useState('');
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [emailVerifyCooldown, setEmailVerifyCooldown] = useState(0);
  const [emailVerifyMessage, setEmailVerifyMessage] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isAddAccount, setIsAddAccount] = useState(false);

  useEffect(() => {
    setCountryCode(getDefaultCountryCode());
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (emailVerifyCooldown <= 0) return;
    const timer = setTimeout(() => setEmailVerifyCooldown(emailVerifyCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailVerifyCooldown]);

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('addAccount') === 'true') {
        setShowForm(true);
        setIsAddAccount(true);
      }
    }
  }, []);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const rawNumber = phoneNumber.trim();
    if (!rawNumber) {
      setError('Please enter your phone number.');
      return;
    }

    const fullPhoneNumber = buildFullPhoneNumber(countryCode, rawNumber);
    const digitsOnly = fullPhoneNumber.replace(/\D/g, '');

    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      setError('Please enter a valid phone number (between 7 and 15 digits).');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({ name, email, phoneNumber: fullPhoneNumber, password });
      if (result.requiresVerification) {
        setEmailVerifyPendingToken(result.tempToken || '');
        setEmailVerifyTargetEmail(result.email || email);
        setEmailVerifyMaskedEmail(result.maskedEmail || '');
        setEmailVerifyRequired(true);
        setEmailVerifyCooldown(30);
        setEmailVerifyMessage(result.message || 'Verification code sent to your email.');
        setError('');
        setIsSubmitting(false);
        return;
      }

      if (result && result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
        window.location.href = nextPath || '/dashboard';
        return;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete registration');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Login handler with 2FA and Email Verification interception
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      if (result.requiresVerification) {
        setEmailVerifyPendingToken(result.tempToken || '');
        setEmailVerifyTargetEmail(result.email || email);
        setEmailVerifyMaskedEmail(result.maskedEmail || '');
        setEmailVerifyRequired(true);
        setEmailVerifyCooldown(30);
        setEmailVerifyMessage(result.message || 'Please verify your email address before signing in.');
        setError('');
        setIsSubmitting(false);
        return;
      }

      if (result.requires2FA && result.tempToken) {
        setTwoFactorPendingToken(result.tempToken);
        setTwoFactorRequired(true);
        const rawMethods = (result.availableMethods || []) as ('totp' | 'email')[];
        const methods: ('totp' | 'email')[] = rawMethods.length > 0 ? rawMethods : ['totp'];
        setTwoFactorAvailableMethods(methods);
        setTwoFactorActiveMethod(result.defaultMethod || (methods.includes('totp') ? 'totp' : 'email'));
        setTwoFactorMaskedEmail(result.email || '');
        setTwoFactorCode('');
        setResendCooldown(result.defaultMethod === 'email' ? 30 : 0);
        setResendMessage(result.defaultMethod === 'email' ? 'Verification code sent to your email.' : '');
        setError('');
        setIsSubmitting(false);
        return;
      }

      if (result && result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
        window.location.href = nextPath || '/dashboard';
        return;
      }
      window.location.href = nextPath || '/dashboard';
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailVerifyCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const result = await verifyEmail({
        tempToken: emailVerifyPendingToken,
        email: emailVerifyTargetEmail,
        code: emailVerifyCode.trim()
      });
      if (result && result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
        window.location.href = nextPath || '/dashboard';
        return;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Invalid verification code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerificationCode() {
    if (emailVerifyCooldown > 0) return;
    setError('');
    setEmailVerifyMessage('');
    try {
      const res = await resendVerification({
        tempToken: emailVerifyPendingToken,
        email: emailVerifyTargetEmail
      });
      setEmailVerifyMessage(res.message || 'New verification code sent to your email.');
      setEmailVerifyCooldown(30);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code');
    }
  }

  async function handleResendEmailOtp() {
    if (resendCooldown > 0 || !twoFactorPendingToken) return;
    setError('');
    setResendMessage('');
    try {
      const res = await sendLoginEmailOtp(twoFactorPendingToken);
      setResendMessage(res.message || 'Verification code resent!');
      setResendCooldown(30);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    }
  }

  // 2FA verification submission
  async function handleVerify2fa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!twoFactorPendingToken || !twoFactorCode.trim()) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await verify2faLogin(
        twoFactorPendingToken,
        twoFactorCode.trim(),
        useBackupCode ? 'backup' : twoFactorActiveMethod
      );
      if (result.user && result.accessToken) {
        saveAccount(result.user, result.accessToken);
        window.location.href = nextPath || '/dashboard';
        return;
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
      window.location.href = nextPath || '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch account');
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
        <Link className="font-semibold text-brand-700 hover:text-brand-800" href={`/register?next=${encodeURIComponent(nextPath)}${isAddAccount ? '&addAccount=true' : ''}`}>
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
                  {useBackupCode
                    ? 'Enter Backup Code'
                    : twoFactorActiveMethod === 'email'
                    ? 'Email Verification Code'
                    : 'Authenticator App Challenge'}
                </h2>
                <p className="text-sm text-ink-500">
                  {useBackupCode
                    ? 'Enter one of your emergency recovery codes (format: XXXXX-XXXXX).'
                    : twoFactorActiveMethod === 'email'
                    ? `Enter the 6-digit one-time password (OTP) sent to ${twoFactorMaskedEmail || 'your email'}.`
                    : 'Open your Authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.) and enter the live 6-digit code.'}
                </p>
              </div>

              {/* Method Switcher Tabs if both methods available and not in backup code mode */}
              {twoFactorAvailableMethods.length > 1 && !useBackupCode && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-ink-100 rounded-xl mb-6 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorActiveMethod('totp');
                      setTwoFactorCode('');
                      setError('');
                      setResendMessage('');
                    }}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
                      twoFactorActiveMethod === 'totp'
                        ? 'bg-white text-ink-900 shadow-xxs'
                        : 'text-ink-500 hover:text-ink-900'
                    }`}
                  >
                    <span>📱 Authenticator App</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setTwoFactorActiveMethod('email');
                      setTwoFactorCode('');
                      setError('');
                      if (resendCooldown === 0) {
                        await handleResendEmailOtp();
                      }
                    }}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
                      twoFactorActiveMethod === 'email'
                        ? 'bg-white text-ink-900 shadow-xxs'
                        : 'text-ink-500 hover:text-ink-900'
                    }`}
                  >
                    <span>✉️ Email OTP</span>
                  </button>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleVerify2fa}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="cash-label" htmlFor="twoFactorCode">
                      {useBackupCode
                        ? 'Recovery Code'
                        : twoFactorActiveMethod === 'email'
                        ? '6-Digit Email Code'
                        : '6-Digit Authenticator Code'}
                    </label>
                    {twoFactorActiveMethod === 'email' && !useBackupCode && (
                      <button
                        type="button"
                        onClick={handleResendEmailOtp}
                        disabled={resendCooldown > 0}
                        className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 disabled:cursor-not-allowed transition"
                      >
                        {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                      </button>
                    )}
                  </div>
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

                {resendMessage && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800">
                    {resendMessage}
                  </div>
                )}

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
                      setResendMessage('');
                    }}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition"
                  >
                    {useBackupCode
                      ? `← Use 6-digit ${twoFactorActiveMethod === 'email' ? 'Email OTP' : 'Authenticator code'}`
                      : 'Use emergency recovery code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorRequired(false);
                      setTwoFactorPendingToken('');
                      setTwoFactorCode('');
                      setError('');
                      setResendMessage('');
                    }}
                    className="text-xs font-medium text-ink-500 hover:text-ink-800 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : emailVerifyRequired ? (
            <div className="cash-card p-6 sm:p-8 bg-white shadow-card">
              <div className="mb-6 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Email Verification</span>
                </div>
                <h2 className="text-3xl font-semibold text-ink-900">Verify your email</h2>
                <p className="text-sm text-ink-500">
                  We&apos;ve sent a 6-digit verification code to{' '}
                  <strong className="text-ink-900">
                    {emailVerifyMaskedEmail || emailVerifyTargetEmail || 'your email'}
                  </strong>
                  . Please enter it below to activate your account.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleVerifyEmail}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="cash-label" htmlFor="emailVerifyCode">
                      6-Digit Verification Code
                    </label>
                    <button
                      type="button"
                      onClick={handleResendVerificationCode}
                      disabled={emailVerifyCooldown > 0}
                      className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 disabled:cursor-not-allowed transition"
                    >
                      {emailVerifyCooldown > 0 ? `Resend code in ${emailVerifyCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                  <input
                    id="emailVerifyCode"
                    type="text"
                    className="cash-input text-center text-2xl tracking-widest font-mono font-bold"
                    value={emailVerifyCode}
                    onChange={(event) => setEmailVerifyCode(event.target.value.trim().toUpperCase())}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                  />
                </div>

                {emailVerifyMessage && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800">
                    {emailVerifyMessage}
                  </div>
                )}

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button type="submit" className="cash-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Verifying...' : 'Verify & Activate Account'}
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailVerifyRequired(false);
                      setEmailVerifyPendingToken('');
                      setEmailVerifyCode('');
                      setError('');
                      setEmailVerifyMessage('');
                    }}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition"
                  >
                    ← Back to {mode === 'login' ? 'sign in' : 'edit details'}
                  </button>

                  <span className="text-xs text-ink-400">Code valid for 24 hours</span>
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
                    <div className="flex gap-2">
                      <div className="relative w-36 sm:w-44 shrink-0">
                        <select
                          id="countryCode"
                          className="cash-input appearance-none bg-white pr-8 text-xs font-medium cursor-pointer"
                          value={countryCode}
                          onChange={(event) => setCountryCode(event.target.value)}
                          aria-label="Country Code"
                        >
                          {COUNTRY_CODES.map((item) => (
                            <option key={`${item.code}-${item.name}`} value={item.code}>
                              {item.flag} {item.code} ({item.name})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-ink-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1">
                        <input
                          id="phoneNumber"
                          type="tel"
                          inputMode="numeric"
                          className="cash-input text-sm"
                          value={phoneNumber}
                          onChange={(event) => setPhoneNumber(event.target.value)}
                          placeholder={getSamplePlaceholder(countryCode)}
                          required
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 text-xxs text-ink-400">
                      Country code is selected on the left. Enter your phone number on the right (e.g. {getSamplePlaceholder(countryCode)}).
                    </p>
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
                  <Link className="font-semibold text-brand-700 hover:text-brand-800" href={`${activeCopy.footerLink}?next=${encodeURIComponent(nextPath)}${isAddAccount ? '&addAccount=true' : ''}`}>
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
