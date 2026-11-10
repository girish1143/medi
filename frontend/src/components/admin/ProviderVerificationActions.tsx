'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, FileCheck2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

export interface ProviderDocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  storageRef: string;
  reviewStatus: string;
  reviewedAt: string | null;
  notes: string | null;
}

export function ProviderVerificationActions({
  providerType,
  providerId,
  currentStatus,
  canVerify,
  documents,
}: {
  providerType: 'DOCTOR' | 'HOSPITAL';
  providerId: string;
  currentStatus: string;
  canVerify: boolean;
  documents: ProviderDocumentRow[];
}) {
  const router = useRouter();
  const [modalAction, setModalAction] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitVerification() {
    if (!modalAction) return;
    if (modalAction === 'REJECTED' && rejectionReason.trim().length < 3) {
      setError('Rejection reason is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/providers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType,
          providerId,
          decision: modalAction,
          ...(modalAction === 'REJECTED' ? { rejectionReason: rejectionReason.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Verification action failed.');
        return;
      }
      setModalAction(null);
      setRejectionReason('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function reviewDoc(docId: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null);
    const res = await apiFetch(`/api/admin/providers/documents/${docId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerType, decision }),
    });
    const json = (await res.json()) as { success: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? 'Failed to update document review.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Credential & Profile Verification</CardTitle>
            <CardDescription>
              Only authorized Operations Admins and Super Admins can approve or reject verification.
            </CardDescription>
          </div>
          <Badge variant={statusBadgeVariant(currentStatus)}>{currentStatus}</Badge>
        </CardHeader>
        {canVerify ? (
          <CardContent className="flex flex-wrap gap-2.5">
            <Button onClick={() => setModalAction('VERIFIED')}>
              <CheckCircle2 className="h-4 w-4" />
              Approve Verification
            </Button>
            <Button variant="destructive" onClick={() => setModalAction('REJECTED')}>
              <XCircle className="h-4 w-4" />
              Reject Verification
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credential & Registration Documents</CardTitle>
          <CardDescription>Review submitted verification artifacts.</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-xs text-slate-500">No credential documents uploaded for this provider.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {documents.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <FileCheck2 className="h-4 w-4 text-teal-700" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {doc.documentType} — {doc.fileName}
                      </p>
                      <p className="text-slate-500">
                        Reviewed: {formatDateTime(doc.reviewedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(doc.reviewStatus)}>{doc.reviewStatus}</Badge>
                    {canVerify ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => reviewDoc(doc.id, 'APPROVED')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => reviewDoc(doc.id, 'REJECTED')}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(modalAction)}
        onClose={() => {
          setModalAction(null);
          setRejectionReason('');
        }}
        onConfirm={submitVerification}
        loading={loading}
        destructive={modalAction === 'REJECTED'}
        confirmLabel={modalAction === 'VERIFIED' ? 'Approve Provider' : 'Reject Provider'}
        title={
          modalAction === 'VERIFIED'
            ? `Approve ${providerType.toLowerCase()} verification?`
            : `Reject ${providerType.toLowerCase()} verification?`
        }
        description={
          modalAction === 'VERIFIED'
            ? 'Approving sets provider verificationStatus to VERIFIED and activates the user account if email is verified.'
            : 'Rejecting revokes active sessions and marks the account REJECTED.'
        }
      >
        {modalAction === 'REJECTED' ? (
          <div>
            <label className="block text-xs font-medium">Rejection Reason (required)</label>
            <Input
              className="mt-1.5"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain missing or invalid license/registration details..."
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
