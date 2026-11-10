'use client';

import { Download, FileText, Pill } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFile } from '@/lib/api';
import type { Prescription } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';

export function PrescriptionDetail({ prescription }: { prescription: Prescription }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <FileText className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{prescription.prescriptionNumber}</h2>
                <p className="text-sm text-slate-500">Issued {formatDateTime(prescription.createdAt)}</p>
                <p className="mt-1 text-xs text-slate-400">Appointment {prescription.appointmentNumber}</p>
              </div>
            </div>
            <Button
              onClick={() =>
                void downloadFile(
                  `/prescriptions/${prescription.id}/pdf`,
                  `MediBook-Prescription-${prescription.prescriptionNumber}.pdf`,
                ).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to download PDF'))
              }
            >
              <Download /> Download PDF
            </Button>
          </div>

          <Separator className="my-5" />

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Doctor</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Dr. {prescription.doctor.name}</p>
              <p className="text-xs text-slate-500">{prescription.doctor.qualification}</p>
              <p className="text-xs text-slate-500">{prescription.doctor.specialty}</p>
              <p className="text-xs text-slate-400">Reg. {prescription.doctor.registrationNumber}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Patient</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{prescription.patient.name}</p>
              <p className="text-xs text-slate-500">
                {prescription.patient.age !== null ? `${prescription.patient.age} years` : 'Age not recorded'}
                {prescription.patient.gender ? ` · ${titleCase(prescription.patient.gender)}` : ''}
              </p>
              <p className="text-xs text-slate-500">{prescription.patient.phone ?? prescription.patient.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnosis & medicines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-blue-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Diagnosis</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{prescription.diagnosis}</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Dosage</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Instructions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescription.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <Pill className="h-3.5 w-3.5 text-teal-500" /> {item.medicineName}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">{item.dosage}</TableCell>
                    <TableCell className="text-slate-600">{item.frequency}</TableCell>
                    <TableCell className="text-slate-600">{item.duration}</TableCell>
                    <TableCell className="text-slate-500">{item.instructions ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {prescription.notes && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor&apos;s notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{prescription.notes}</p>
            </div>
          )}

          {prescription.followUpDate && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Follow-up advised on <strong>{formatDate(prescription.followUpDate)}</strong>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
