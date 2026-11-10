'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { NotificationsView } from '@/components/notifications/notifications-view';

export default function PatientNotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Appointment updates, reminders and messages from your care team." />
      <NotificationsView />
    </div>
  );
}
