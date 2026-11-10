import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell roles={['receptionist', 'admin']} title="Reception desk">
      {children}
    </DashboardShell>
  );
}
