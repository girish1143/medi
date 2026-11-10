'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { Complaint } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime, titleCase } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_review: 'bg-blue-50 text-blue-700 ring-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function PatientSupportPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  const query = useQuery({
    queryKey: ['support', 'mine'],
    queryFn: () => apiRequest<Complaint[]>('/support'),
  });

  const create = useMutation({
    mutationFn: () => apiRequest('/support', { method: 'POST', body: { subject, description } }),
    onSuccess: () => {
      toast.success('Support request submitted. We will get back to you shortly.');
      setOpen(false);
      setSubject('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['support', 'mine'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to submit request'),
  });

  const items = query.data ?? [];

  return (
    <div>
      <PageHeader
        title="Help & support"
        description="Raise a request about a booking, payment, refund or your account. Our team usually responds within one business day."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New request
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {query.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState description="We could not load your support requests." onRetry={() => void query.refetch()} />
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-400">Raised {formatDateTime(item.createdAt)}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_STYLES[item.status] ?? STATUS_STYLES.open
                      }`}
                    >
                      {titleCase(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.description}</p>
                  {item.resolution && (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                      <p className="font-semibold">Resolution</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{item.resolution}</p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={LifeBuoy}
              title="No support requests"
              description="If you need help with an appointment or payment, raise a request and our team will assist you."
              action={{ label: 'Create a request', onClick: () => setOpen(true) }}
            />
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" /> How can we help?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>For urgent medical emergencies, please call your local emergency number or visit the nearest hospital.</p>
            <div>
              <p className="font-semibold text-slate-800">Common requests</p>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-500">
                <li>• Refund or payment issue</li>
                <li>• Reschedule or cancellation help</li>
                <li>• Prescription or report access</li>
                <li>• Account and profile updates</li>
              </ul>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/patient/appointments">Review my appointments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
            <DialogDescription>Share the details and we will route your request to the right team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                className="mt-2"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Refund not received for cancelled appointment"
              />
            </div>
            <div>
              <Label htmlFor="description">Describe the issue</Label>
              <Textarea
                id="description"
                className="mt-2"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Include the appointment reference, date and what happened."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={subject.trim().length < 3 || description.trim().length < 10}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              <Send /> Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
