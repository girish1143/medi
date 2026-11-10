import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell roles={['patient']} title="Patient dashboard">
      {children}
    </DashboardShell>
  );
}
