'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { NotificationsView } from '@/components/notifications/notifications-view';

export default function ReceptionNotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Front-desk updates about today&apos;s appointments and check-ins." />
      <NotificationsView />
    </div>
  );
}
