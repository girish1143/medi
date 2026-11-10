'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { NotificationsView } from '@/components/notifications/notifications-view';

export default function AdminNotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Platform alerts, verification updates and support activity." />
      <NotificationsView />
    </div>
  );
}
