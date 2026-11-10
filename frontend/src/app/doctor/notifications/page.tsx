'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { NotificationsView } from '@/components/notifications/notifications-view';

export default function DoctorNotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="New bookings, cancellations and reminders for your clinic." />
      <NotificationsView />
    </div>
  );
}
