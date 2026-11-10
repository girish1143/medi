'use client';

import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/ui/table';
import { apiFetch } from '@/services/api-client';

export function DoctorSpecializationsManager({
  doctorId,
  specializations,
  canEdit,
}: {
  doctorId: string;
  specializations: Array<{
    id: string;
    specializationCode: string;
    specializationName: string;
    isPrimary: boolean;
  }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addSpecialization(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/doctors/${doctorId}/specializations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specializationCode: code, specializationName: name, isPrimary }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to add specialization.');
        return;
      }
      setCode('');
      setName('');
      setIsPrimary(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeSpec(specId: string) {
    await apiFetch(`/api/admin/doctors/${doctorId}/specializations?specId=${encodeURIComponent(specId)}`, {
      method: 'DELETE',
    });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Specializations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner message={error} />
        <div className="flex flex-wrap gap-2">
          {specializations.length === 0 ? (
            <p className="text-xs text-slate-500">No specializations assigned.</p>
          ) : (
            specializations.map((spec) => (
              <div
                key={spec.id}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700"
              >
                <span className="font-medium">{spec.specializationName}</span>
                <span className="text-slate-400">({spec.specializationCode})</span>
                {spec.isPrimary ? <Badge variant="info">Primary</Badge> : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeSpec(spec.id)}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Remove specialization"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>

        {canEdit ? (
          <form onSubmit={addSpecialization} className="grid gap-2.5 sm:grid-cols-4">
            <Input
              placeholder="Code (e.g. CARDIOLOGY)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <Input
              placeholder="Display Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
              />
              Primary Specialty
            </label>
            <Button type="submit" size="sm" disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Add Specialization'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
