'use client';

import { CheckCircle2, Plus, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorBanner, TableSkeleton } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface SettingItem {
  id: string;
  key: string;
  category: 'GENERAL' | 'LEAD_ROUTING' | 'PRIVACY_CONSENT' | 'BILLING' | 'SECURITY' | 'NOTIFICATIONS';
  value: string | number | boolean;
  description: string | null;
  updatedAt: string;
}

interface RoleMatrixItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  permissions: string[];
}

const RECOMMENDED_SETTING_TEMPLATES: Array<{
  key: string;
  category: SettingItem['category'];
  defaultValue: string | number | boolean;
  description: string;
}> = [
  {
    key: 'lead_routing.default_assignment_expiry_hours',
    category: 'LEAD_ROUTING',
    defaultValue: 24,
    description: 'Hours before an unaccepted provider lead assignment expires for re-routing.',
  },
  {
    key: 'lead_routing.max_concurrent_providers',
    category: 'LEAD_ROUTING',
    defaultValue: 3,
    description: 'Maximum concurrent active provider assignments per qualified lead.',
  },
  {
    key: 'privacy.require_explicit_contact_consent',
    category: 'PRIVACY_CONSENT',
    defaultValue: true,
    description: 'Enforces PROVIDER_CONTACT_DISCLOSURE check before revealing patient contact PII.',
  },
  {
    key: 'security.login_rate_limit_attempts',
    category: 'SECURITY',
    defaultValue: 5,
    description: 'Failed login attempts per window before rate-limit lockout activates.',
  },
];

export function SettingsClient() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [roles, setRoles] = useState<RoleMatrixItem[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newCategory, setNewCategory] = useState<SettingItem['category']>('GENERAL');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/settings', { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: { settings: SettingItem[]; roles: RoleMatrixItem[] };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load platform settings.');
      }
      setSettings(json.data.settings);
      setRoles(json.data.roles);
      const nextDraft: Record<string, string> = {};
      for (const s of json.data.settings) {
        nextDraft[s.key] = String(s.value);
      }
      setDraftValues(nextDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function coerceSettingValue(raw: string): string | number | boolean {
    const trimmed = raw.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }

  async function saveExistingSettings() {
    if (settings.length === 0) return;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const payload = settings.map((item) => ({
        key: item.key,
        category: item.category,
        value: coerceSettingValue(draftValues[item.key] ?? String(item.value)),
        ...(item.description ? { description: item.description } : {}),
      }));
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      const json = (await res.json()) as { data?: { updatedCount: number }; error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to save platform settings.');
      }
      setSavedNotice(`Saved ${json.data?.updatedCount ?? payload.length} configuration key(s).`);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSingleSetting(item: {
    key: string;
    category: SettingItem['category'];
    value: string | number | boolean;
    description?: string;
  }) {
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [item] }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to save configuration key.');
      }
      setSavedNotice(`Saved setting '${item.key}'.`);
      setNewKey('');
      setNewValue('');
      setNewDescription('');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create setting.');
    } finally {
      setSaving(false);
    }
  }

  const existingKeys = new Set(settings.map((s) => s.key));
  const missingTemplates = RECOMMENDED_SETTING_TEMPLATES.filter((t) => !existingKeys.has(t.key));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Platform Settings &amp; RBAC Policy
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure operational rules in SQLite and inspect role-permission assignments. Secrets belong strictly in environment variables.
          </p>
        </div>
        {settings.length > 0 ? (
          <Button onClick={() => void saveExistingSettings()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        ) : null}
      </div>

      <ErrorBanner message={error} />
      {savedNotice ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-teal-600" />
                Persisted Configuration Keys ({settings.length})
              </CardTitle>
              <CardDescription>
                Active configuration records stored in the PlatformSetting table. Empty initially until configured by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.length === 0 ? (
                <EmptyState
                  title="No platform settings persisted yet"
                  description="Save one of the canonical templates below or create a custom operational setting key."
                />
              ) : (
                <div className="space-y-3">
                  {settings.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-12 sm:items-center"
                    >
                      <div className="sm:col-span-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {item.key}
                          </span>
                          <Badge variant="outline">{item.category}</Badge>
                        </div>
                        {item.description ? (
                          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Updated {formatDateTime(item.updatedAt)}
                        </p>
                      </div>
                      <div className="sm:col-span-6">
                        <Input
                          value={draftValues[item.key] ?? ''}
                          onChange={(e) =>
                            setDraftValues((prev) => ({ ...prev, [item.key]: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {missingTemplates.length > 0 ? (
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unconfigured Canonical Policy Templates (Click to Persist Explicitly)
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {missingTemplates.map((tpl) => (
                      <div
                        key={tpl.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-xs dark:border-slate-700"
                      >
                        <div>
                          <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {tpl.key}
                          </div>
                          <div className="mt-0.5 text-slate-500">
                            {tpl.description} (Default: <strong>{String(tpl.defaultValue)}</strong>)
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() =>
                            void saveSingleSetting({
                              key: tpl.key,
                              category: tpl.category,
                              value: tpl.defaultValue,
                              description: tpl.description,
                            })
                          }
                        >
                          Configure
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Add Custom Configuration Setting
                </div>
                <div className="grid gap-2 sm:grid-cols-12">
                  <Input
                    className="sm:col-span-4"
                    placeholder="setting.key_name"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  />
                  <Select
                    className="sm:col-span-3"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as SettingItem['category'])}
                  >
                    <option value="GENERAL">GENERAL</option>
                    <option value="LEAD_ROUTING">LEAD_ROUTING</option>
                    <option value="PRIVACY_CONSENT">PRIVACY_CONSENT</option>
                    <option value="BILLING">BILLING</option>
                    <option value="SECURITY">SECURITY</option>
                    <option value="NOTIFICATIONS">NOTIFICATIONS</option>
                  </Select>
                  <Input
                    className="sm:col-span-2"
                    placeholder="Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                  <Input
                    className="sm:col-span-3"
                    placeholder="Description (optional)"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving || !newKey.trim() || !newValue.trim()}
                    onClick={() =>
                      void saveSingleSetting({
                        key: newKey.trim().toLowerCase(),
                        category: newCategory,
                        value: coerceSettingValue(newValue),
                        description: newDescription.trim() || undefined,
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Save New Setting
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                RBAC Role &amp; Permission Catalog
              </CardTitle>
              <CardDescription>
                Server-enforced permissions currently provisioned in AdminRolePermission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <p className="text-xs text-slate-500">No AdminRole rows found in database.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {roles.map((role) => (
                    <div
                      key={role.id}
                      className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {role.name}
                          </div>
                          <div className="font-mono text-xs text-slate-500">{role.code}</div>
                        </div>
                        <Badge variant={role.isActive ? 'success' : 'danger'}>
                          {role.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </div>
                      {role.description ? (
                        <p className="mt-1.5 text-xs text-slate-500">{role.description}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {role.permissions.map((perm) => (
                          <Badge key={perm} variant="info" className="font-mono text-[11px]">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
