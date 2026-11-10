'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { PrescriptionList } from '@/components/prescriptions/prescription-list';

export default function PatientPrescriptionsPage() {
  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="View medicines, dosage instructions and download a PDF copy of every prescription."
      />
      <PrescriptionList basePath="/patient/prescriptions" heading="All prescriptions" description="Prescriptions issued to you across all consultations." />
    </div>
  );
}
