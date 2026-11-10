'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, RefreshCw, Search, Sparkles, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';
import type { EligibleProviderMatch } from '@/types/api.types';

interface LeadDetailProps {
  lead: {
    id: string;
    patientRef: string;
    specialization: string;
    locationCity: string;
    locationState: string;
    countryCode: string;
    consultationMode: string;
    enquiryDescription: string;
    leadSource: string;
    status: string;
    priority: string;
    createdAt: string;
    qualifiedAt: string | null;
    closedAt: string | null;
  };
  consents: Array<{
    id: string;
    consentPurpose: string;
    authorizedProviderScope: string;
    status: string;
    consentVersion: string;
    grantedAt: string;
    revokedAt: string | null;
  }>;
  assignments: Array<{
    id: string;
    providerType: string;
    providerName: string;
    status: string;
    matchScore: number | null;
    assignedAt: string;
    acceptedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
  }>;
  history: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  canQualify: boolean;
  canAssign: boolean;
  canRevealContact: boolean;
}

export function LeadDetailClient({
  lead,
  consents,
  assignments,
  history,
  canQualify,
  canAssign,
  canRevealContact,
}: LeadDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [revealedContact, setRevealedContact] = useState<{
    fullName: string;
    email: string;
    phone: string | null;
  } | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [matches, setMatches] = useState<EligibleProviderMatch[]>([]);
  const [matchQ, setMatchQ] = useState('');
  const [matchCity, setMatchCity] = useState(lead.locationCity);
  const [matchSpec, setMatchSpec] = useState(lead.specialization);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const activeDisclosureConsent = consents.find(
    (c) =>
      c.consentPurpose === 'PROVIDER_CONTACT_DISCLOSURE' &&
      c.status === 'GRANTED' &&
      c.revokedAt === null,
  );

  const activePendingOrAcceptedAssignment = assignments.find(
    (a) => a.status === 'PENDING' || a.status === 'ACCEPTED',
  );

  const loadMatches = useCallback(async () => {
    if (!canAssign) return;
    setLoadingMatches(true);
    try {
      const qs = new URLSearchParams();
      if (matchQ.trim()) qs.set('q', matchQ.trim());
      if (matchCity.trim()) qs.set('city', matchCity.trim());
      if (matchSpec.trim()) qs.set('specialization', matchSpec.trim());
      const res = await apiFetch(`/api/admin/leads/${lead.id}/matches?${qs.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { matches: EligibleProviderMatch[] };
      };
      if (res.ok && json.success && json.data) {
        setMatches(json.data.matches);
      }
    } finally {
      setLoadingMatches(false);
    }
  }, [canAssign, lead.id, matchQ, matchCity, matchSpec]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  async function transitionStatus(status: 'QUALIFIED' | 'REJECTED', reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to update lead status.');
        return;
      }
      setRejectOpen(false);
      setRejectReason('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revealContact() {
    setError(null);
    const res = await apiFetch(`/api/admin/leads/${lead.id}/reveal-contact`, { method: 'POST' });
    const json = (await res.json()) as {
      success: boolean;
      data?: { contact: { fullName: string; email: string; phone: string | null } };
      error?: { message?: string };
    };
    if (!res.ok || !json.success || !json.data) {
      setError(json.error?.message ?? 'Contact details blocked by consent policy.');
      return;
    }
    setRevealedContact(json.data.contact);
  }

  async function manualAssign(match: EligibleProviderMatch, isReassign: boolean) {
    setBusy(true);
    setError(null);
    try {
      const endpoint = isReassign
        ? `/api/admin/leads/${lead.id}/reassign`
        : `/api/leads/${lead.id}/assign`;

      const payload = isReassign
        ? {
            revokeAssignmentId: activePendingOrAcceptedAssignment?.id,
            providerType: match.providerType,
            providerId: match.providerId,
            reason: 'Manual reassignment from admin CRM',
          }
        : {
            providerType: match.providerType,
            providerId: match.providerId,
            matchScore: match.matchScore,
          };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Assignment failed.');
        return;
      }
      await loadMatches();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function triggerAutoMatch() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/leads/${lead.id}/matches`, { method: 'POST' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Auto-match failed.');
        return;
      }
      await loadMatches();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      {/* Lead Summary & Qualification Actions */}
      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant(lead.status)}>{lead.status}</Badge>
              <Badge variant="outline">{lead.priority}</Badge>
              <span className="font-mono text-xs text-slate-500">{lead.patientRef}</span>
            </div>
            <CardTitle className="mt-2 text-lg">
              {lead.specialization} · {lead.locationCity}, {lead.locationState} ({lead.countryCode})
            </CardTitle>
            <CardDescription>
              Source: {lead.leadSource} · Mode: {lead.consultationMode} · Created:{' '}
              {formatDateTime(lead.createdAt)}
            </CardDescription>
          </div>

          {canQualify ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || lead.status === 'QUALIFIED'}
                onClick={() => transitionStatus('QUALIFIED')}
              >
                <CheckCircle2 className="h-4 w-4" />
                Qualify Lead
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || lead.status === 'REJECTED'}
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {lead.enquiryDescription}
          </p>
        </CardContent>
      </Card>

      {/* Consent Verification & Protected Contact Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Consent Verification & Patient Contact Gate</CardTitle>
            <CardDescription>
              Contact details are strictly gated by active PROVIDER_CONTACT_DISCLOSURE consent and
              audited on reveal.
            </CardDescription>
          </div>
          <Badge variant={activeDisclosureConsent ? 'success' : 'danger'}>
            {activeDisclosureConsent ? 'Consent Active' : 'No Active Disclosure Consent'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {canRevealContact ? (
            revealedContact ? (
              <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-xs sm:grid-cols-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div>
                  <span className="text-slate-500">Patient Name</span>
                  <p className="mt-1 font-semibold">{revealedContact.fullName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Email</span>
                  <p className="mt-1 font-semibold">{revealedContact.email}</p>
                </div>
                <div>
                  <span className="text-slate-500">Phone</span>
                  <p className="mt-1 font-semibold">{revealedContact.phone ?? '—'}</p>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={revealContact}>
                <Eye className="h-4 w-4" />
                Verify Consent & Reveal Patient Contact
              </Button>
            )
          ) : (
            <p className="text-xs text-slate-500">Your role lacks permission to view patient contact details.</p>
          )}
        </CardContent>
      </Card>

      {/* Matching & Transactional Assignment Interface */}
      {canAssign ? (
        <Card>
          <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Provider Matching & Transactional Assignment</CardTitle>
              <CardDescription>
                Matches verified providers by specialization, location, subscription quota, and active
                limits.
              </CardDescription>
            </div>
            <Button size="sm" disabled={busy || !activeDisclosureConsent} onClick={triggerAutoMatch}>
              <Sparkles className="h-4 w-4" />
              Auto-Match & Assign
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Provider name..."
                  value={matchQ}
                  onChange={(e) => setMatchQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Input
                placeholder="Specialization"
                value={matchSpec}
                onChange={(e) => setMatchSpec(e.target.value.toUpperCase())}
              />
              <Input placeholder="City" value={matchCity} onChange={(e) => setMatchCity(e.target.value)} />
              <Button variant="outline" size="sm" onClick={loadMatches} disabled={loadingMatches}>
                <RefreshCw className="h-3.5 w-3.5" />
                {loadingMatches ? 'Searching...' : 'Search Providers'}
              </Button>
            </div>

            {matches.length === 0 ? (
              <p className="text-xs text-slate-500">
                No verified providers match the selected specialization and location filters.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {matches.map((m) => (
                  <div
                    key={`${m.providerType}-${m.providerId}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {m.displayName}{' '}
                        <span className="font-normal text-slate-500">({m.providerType})</span>
                      </p>
                      <p className="text-slate-500">
                        {m.city}, {m.stateProvince} · Score: {m.matchScore} · Remaining Quota:{' '}
                        {m.remainingQuota}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={m.specializationMatched ? 'success' : 'default'}>
                        {m.specializationMatched ? 'Spec Match' : 'Other Spec'}
                      </Badge>
                      <Badge variant={m.hasActiveSubscription ? 'success' : 'danger'}>
                        {m.hasActiveSubscription ? 'Eligible Sub' : 'No Quota'}
                      </Badge>
                      {m.alreadyAssigned ? (
                        <Badge variant="info">Currently Assigned</Badge>
                      ) : activePendingOrAcceptedAssignment ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !activeDisclosureConsent}
                          onClick={() => manualAssign(m, true)}
                        >
                          Reassign
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy || !activeDisclosureConsent}
                          onClick={() => manualAssign(m, false)}
                        >
                          Assign
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Assignment & Provider Response Tracking */}
      <Card>
        <CardHeader>
          <CardTitle>Assignment & Provider Response History</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-xs text-slate-500">No assignments dispatched yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {assignments.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                  <div>
                    <p className="font-medium">
                      {a.providerName} ({a.providerType})
                    </p>
                    <p className="text-slate-500">
                      Assigned: {formatDateTime(a.assignedAt)}
                      {a.acceptedAt ? ` · Accepted: ${formatDateTime(a.acceptedAt)}` : ''}
                      {a.rejectedAt ? ` · Rejected: ${formatDateTime(a.rejectedAt)}` : ''}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(a.status)}>{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead History Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Lifecycle Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No transition records yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <p className="font-medium">{h.eventType}</p>
                    <p className="text-slate-500">
                      {h.fromStatus ?? '—'} → {h.toStatus ?? '—'} {h.reason ? `· ${h.reason}` : ''}
                    </p>
                  </div>
                  <span className="text-slate-400">{formatDateTime(h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => transitionStatus('REJECTED', rejectReason)}
        destructive
        loading={busy}
        confirmLabel="Reject Lead"
        title="Reject Healthcare Lead?"
        description="Provide a reason recorded in LeadHistory and AuditLog."
      >
        <Input
          placeholder="Rejection reason..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
