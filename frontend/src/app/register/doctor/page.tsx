'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { FormMessage } from '@/components/auth/FormMessage';
import { authService } from '@/services/auth.service';

export default function DoctorRegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    medicalLicenseNumber: '',
    licensingAuthority: '',
    licenseCountryCode: 'US',
    specializationCode: '',
    specializationName: '',
    city: '',
    stateProvince: '',
    countryCode: 'US',
    acceptedTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const response = await authService.registerDoctor(form);
      const payload = (await response.json()) as {
        success: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? 'Doctor registration failed.');
        return;
      }
      setSuccess(
        payload.data?.message ??
          'Registration submitted. Pending email verification and administrator credential approval.',
      );
      setForm((prev) => ({ ...prev, password: '' }));
    } catch {
      setError('Unable to submit doctor registration right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Doctor registration"
      subtitle="Accounts remain pending verification until medical credentials are reviewed by an administrator."
      footer={
        <p>
          Already verified?{' '}
          <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
            Sign in
          </Link>
        </p>
      }
    >
      <FormMessage type="error" message={error} />
      <FormMessage type="success" message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="license" className="block text-sm font-medium text-slate-700">
              Medical registration number
            </label>
            <input
              id="license"
              type="text"
              required
              value={form.medicalLicenseNumber}
              onChange={(e) => setForm({ ...form, medicalLicenseNumber: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="licenseCountry" className="block text-sm font-medium text-slate-700">
              License country
            </label>
            <input
              id="licenseCountry"
              type="text"
              required
              maxLength={2}
              value={form.licenseCountryCode}
              onChange={(e) =>
                setForm({ ...form, licenseCountryCode: e.target.value.toUpperCase() })
              }
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="authority" className="block text-sm font-medium text-slate-700">
            Licensing authority
          </label>
          <input
            id="authority"
            type="text"
            required
            value={form.licensingAuthority}
            onChange={(e) => setForm({ ...form, licensingAuthority: e.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="specCode" className="block text-sm font-medium text-slate-700">
              Specialization code
            </label>
            <input
              id="specCode"
              type="text"
              required
              placeholder="CARDIOLOGY"
              value={form.specializationCode}
              onChange={(e) =>
                setForm({ ...form, specializationCode: e.target.value.toUpperCase() })
              }
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="specName" className="block text-sm font-medium text-slate-700">
              Specialization name
            </label>
            <input
              id="specName"
              type="text"
              required
              placeholder="Cardiology"
              value={form.specializationName}
              onChange={(e) => setForm({ ...form, specializationName: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-slate-700">
              City
            </label>
            <input
              id="city"
              type="text"
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-slate-700">
              State / Province
            </label>
            <input
              id="state"
              type="text"
              required
              value={form.stateProvince}
              onChange={(e) => setForm({ ...form, stateProvince: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-700">
              Country (ISO)
            </label>
            <input
              id="country"
              type="text"
              required
              maxLength={2}
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password (12+ chars, upper/lower/digit/symbol)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <label className="flex items-start gap-2.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
          />
          <span>
            I certify that my medical registration details are accurate and accept the Provider Terms
            and Privacy Notice.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? 'Submitting application...' : 'Submit doctor registration'}
        </button>
      </form>
    </AuthShell>
  );
}
