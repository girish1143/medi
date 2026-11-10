'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { FormMessage } from '@/components/auth/FormMessage';
import { authService } from '@/services/auth.service';

export default function HospitalRegisterPage() {
  const [form, setForm] = useState({
    hospitalName: '',
    email: '',
    phone: '',
    password: '',
    registrationNumber: '',
    accreditationBody: '',
    addressLine1: '',
    city: '',
    stateProvince: '',
    postalCode: '',
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
      const response = await authService.registerHospital(form);
      const payload = (await response.json()) as {
        success: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? 'Hospital registration failed.');
        return;
      }
      setSuccess(
        payload.data?.message ??
          'Hospital application submitted. Pending email verification and administrator approval.',
      );
      setForm((prev) => ({ ...prev, password: '' }));
    } catch {
      setError('Unable to submit hospital registration right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Hospital registration"
      subtitle="Healthcare facilities remain pending verification until approved by Operations Administration."
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
          <label htmlFor="hospitalName" className="block text-sm font-medium text-slate-700">
            Hospital / Facility name
          </label>
          <input
            id="hospitalName"
            type="text"
            required
            value={form.hospitalName}
            onChange={(e) => setForm({ ...form, hospitalName: e.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Official email
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
              Contact number
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="regNumber" className="block text-sm font-medium text-slate-700">
              Hospital registration number
            </label>
            <input
              id="regNumber"
              type="text"
              required
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="accred" className="block text-sm font-medium text-slate-700">
              Accreditation body (optional)
            </label>
            <input
              id="accred"
              type="text"
              value={form.accreditationBody}
              onChange={(e) => setForm({ ...form, accreditationBody: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-slate-700">
            Street address
          </label>
          <input
            id="address"
            type="text"
            required
            value={form.addressLine1}
            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
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
              State
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
            <label htmlFor="postal" className="block text-sm font-medium text-slate-700">
              Postal code
            </label>
            <input
              id="postal"
              type="text"
              required
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-700">
              Country
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
            I am authorized to register this healthcare facility and accept the Provider Terms and
            Data Protection Agreement.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? 'Submitting registration...' : 'Submit hospital registration'}
        </button>
      </form>
    </AuthShell>
  );
}
