import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell roles={['doctor']} title="Doctor workspace">
      {children}
    </DashboardShell>
  );
}
