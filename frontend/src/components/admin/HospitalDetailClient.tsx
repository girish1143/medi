'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/ui/table';
import { apiFetch } from '@/services/api-client';

export function HospitalDepartmentsManager({
  hospitalId,
  departments,
  canEdit,
}: {
  hospitalId: string;
  departments: Array<{
    id: string;
    name: string;
    specializationCode: string;
    specializationName: string;
    headDoctorName: string | null;
    isActive: boolean;
    isAcceptingLeads: boolean;
  }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [specializationCode, setSpecializationCode] = useState('');
  const [specializationName, setSpecializationName] = useState('');
  const [headDoctorName, setHeadDoctorName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addDepartment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/hospitals/${hospitalId}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          specializationCode,
          specializationName,
          ...(headDoctorName.trim() ? { headDoctorName: headDoctorName.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to save department.');
        return;
      }
      setName('');
      setSpecializationCode('');
      setSpecializationName('');
      setHeadDoctorName('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleDepartment(dept: (typeof departments)[number]) {
    await apiFetch(`/api/admin/hospitals/${hospitalId}/departments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departmentId: dept.id,
        isActive: !dept.isActive,
        isAcceptingLeads: !dept.isActive,
      }),
    });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hospital Departments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner message={error} />
        {departments.length === 0 ? (
          <p className="text-xs text-slate-500">No departments configured for this facility yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {departments.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {d.name} · {d.specializationName} ({d.specializationCode})
                  </p>
                  {d.headDoctorName ? (
                    <p className="text-slate-500">Head: {d.headDoctorName}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={d.isActive ? 'success' : 'default'}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {canEdit ? (
                    <Button size="sm" variant="outline" onClick={() => toggleDepartment(d)}>
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit ? (
          <form onSubmit={addDepartment} className="grid gap-2.5 sm:grid-cols-5">
            <Input
              placeholder="Department Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              placeholder="Spec Code (ORTHOPEDICS)"
              value={specializationCode}
              onChange={(e) => setSpecializationCode(e.target.value.toUpperCase())}
              required
            />
            <Input
              placeholder="Specialty Display"
              value={specializationName}
              onChange={(e) => setSpecializationName(e.target.value)}
              required
            />
            <Input
              placeholder="Head Doctor (optional)"
              value={headDoctorName}
              onChange={(e) => setHeadDoctorName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Add Dept'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
