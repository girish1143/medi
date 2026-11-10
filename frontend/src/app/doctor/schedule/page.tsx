'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, Clock3, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { DoctorSchedule } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WEEKDAYS, formatDateTime } from '@/lib/utils';

interface AvailabilityDraft {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  breakStart: string;
  breakEnd: string;
  isActive: boolean;
}

const defaultSlot = (): AvailabilityDraft => ({
  weekday: 1,
  startTime: '09:00',
  endTime: '17:00',
  slotMinutes: 30,
  breakStart: '',
  breakEnd: '',
  isActive: true,
});

function toIstIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export default function DoctorSchedulePage() {
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState<AvailabilityDraft[]>([]);
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: ['doctor', 'schedule'],
    queryFn: () => apiRequest<DoctorSchedule>('/doctor-portal/schedule'),
  });

  useEffect(() => {
    if (!query.data) return;
    setSlots(
      query.data.availability.map((row) => ({
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        slotMinutes: row.slotMinutes,
        breakStart: row.breakStart ?? '',
        breakEnd: row.breakEnd ?? '',
        isActive: row.isActive,
      })),
    );
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest('/doctor-portal/availability', {
        method: 'PUT',
        body: {
          slots: slots.map((slot) => ({
            weekday: slot.weekday,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotMinutes: slot.slotMinutes,
            breakStart: slot.breakStart || null,
            breakEnd: slot.breakEnd || null,
            isActive: slot.isActive,
          })),
        },
      }),
    onSuccess: () => {
      toast.success('Availability updated');
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'schedule'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save availability'),
  });

  const addTimeOff = useMutation({
    mutationFn: () =>
      apiRequest('/doctor-portal/time-off', {
        method: 'POST',
        body: { startsAt: toIstIso(startsAt), endsAt: toIstIso(endsAt), reason: reason || undefined },
      }),
    onSuccess: () => {
      toast.success('Time off added');
      setTimeOffOpen(false);
      setStartsAt('');
      setEndsAt('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'schedule'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to add time off'),
  });

  const removeTimeOff = useMutation({
    mutationFn: (timeOffId: string) => apiRequest(`/doctor-portal/time-off/${timeOffId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Time off removed');
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'schedule'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to remove time off'),
  });

  function updateSlot(index: number, patch: Partial<AvailabilityDraft>) {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ErrorState description="We could not load your schedule." onRetry={() => void query.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="Availability & time off"
        description="Set the weekly hours patients can book, then block specific dates when you are unavailable."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-600" /> Weekly hours
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setSlots((current) => [...current, defaultSlot()])}>
              <Plus /> Add session
            </Button>
          </CardHeader>
          <CardContent>
            {slots.length ? (
              <div className="space-y-3">
                {slots.map((slot, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-36">
                        <Label className="text-[11px] text-slate-500">Day</Label>
                        <Select value={String(slot.weekday)} onValueChange={(value) => updateSlot(index, { weekday: Number(value) })}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((day, weekday) => (
                              <SelectItem key={day} value={String(weekday)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Start</Label>
                        <Input type="time" className="mt-1 h-9 w-28" value={slot.startTime} onChange={(event) => updateSlot(index, { startTime: event.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">End</Label>
                        <Input type="time" className="mt-1 h-9 w-28" value={slot.endTime} onChange={(event) => updateSlot(index, { endTime: event.target.value })} />
                      </div>
                      <div className="w-28">
                        <Label className="text-[11px] text-slate-500">Slot</Label>
                        <Select value={String(slot.slotMinutes)} onValueChange={(value) => updateSlot(index, { slotMinutes: Number(value) })}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[15, 20, 30, 60].map((minutes) => (
                              <SelectItem key={minutes} value={String(minutes)}>
                                {minutes} min
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Break start</Label>
                        <Input type="time" className="mt-1 h-9 w-28" value={slot.breakStart} onChange={(event) => updateSlot(index, { breakStart: event.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Break end</Label>
                        <Input type="time" className="mt-1 h-9 w-28" value={slot.breakEnd} onChange={(event) => updateSlot(index, { breakEnd: event.target.value })} />
                      </div>
                      <div className="flex items-center gap-2 pb-2">
                        <Switch checked={slot.isActive} onCheckedChange={(checked) => updateSlot(index, { isActive: checked })} />
                        <span className="text-xs text-slate-500">{slot.isActive ? 'Active' : 'Paused'}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="mb-0.5 ml-auto text-rose-600"
                        onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                        aria-label="Remove session"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No weekly sessions yet. Add your first session so patients can start booking.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                <Save /> Save availability
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-amber-600" /> Time off
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setTimeOffOpen(true)}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {query.data.timeOff.length ? (
              <div className="space-y-2">
                {query.data.timeOff.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          {formatDateTime(entry.startsAt)} → {formatDateTime(entry.endsAt)}
                        </p>
                        {entry.reason && <p className="mt-0.5 text-xs text-slate-500">{entry.reason}</p>}
                      </div>
                      <ConfirmDialog
                        title="Remove time off?"
                        description="Patients will be able to book this period again."
                        confirmLabel="Remove"
                        destructive
                        onConfirm={async () => {
                          await removeTimeOff.mutateAsync(entry.id);
                        }}
                        trigger={
                          <Button variant="ghost" size="icon-sm" className="text-rose-600" aria-label="Remove time off">
                            <Trash2 />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                No time off scheduled. Existing bookings are not affected unless you cancel them.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={timeOffOpen} onOpenChange={setTimeOffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add time off</DialogTitle>
            <DialogDescription>Block a period when you cannot take appointments. Times are in IST.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="timeoff-start">Starts</Label>
              <Input id="timeoff-start" type="datetime-local" className="mt-2" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="timeoff-end">Ends</Label>
              <Input id="timeoff-end" type="datetime-local" className="mt-2" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="timeoff-reason">Reason (optional)</Label>
              <Input id="timeoff-reason" className="mt-2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Conference, personal leave, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeOffOpen(false)}>Cancel</Button>
            <Button
              disabled={!startsAt || !endsAt}
              loading={addTimeOff.isPending}
              onClick={() => addTimeOff.mutate()}
            >
              Add time off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
