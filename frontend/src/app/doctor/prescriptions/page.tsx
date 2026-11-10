'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { PrescriptionList } from '@/components/prescriptions/prescription-list';

export default function DoctorPrescriptionsPage() {
  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="Every prescription you have issued, with quick PDF downloads."
      />
      <PrescriptionList basePath="/doctor/prescriptions" heading="Issued prescriptions" description="Search by patient, diagnosis or prescription number." />
    </div>
  );
}
