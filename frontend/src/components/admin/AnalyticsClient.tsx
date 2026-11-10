'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { DashboardOverviewClient } from '@/components/admin/DashboardCharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminDashboardData } from '@/types/api.types';

const EXPORT_REPORTS = [
  { key: 'leads', label: 'Lead Generation CSV' },
  { key: 'revenue', label: 'Revenue CSV' },
  { key: 'doctors', label: 'Doctor Performance CSV' },
  { key: 'hospitals', label: 'Hospital Performance CSV' },
  { key: 'locations', label: 'Location Enquiries CSV' },
  { key: 'subscriptions', label: 'Subscription Performance CSV' },
] as const;

export function AnalyticsClient({ initialData }: { initialData: AdminDashboardData }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  function triggerExport(reportKey: string) {
    setDownloading(reportKey);
    window.location.href = `/api/admin/analytics/export?report=${encodeURIComponent(reportKey)}`;
    setTimeout(() => setDownloading(null), 800);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Authorized CSV Report Exports</CardTitle>
          <CardDescription>
            Every analytics export is permission-checked and recorded in immutable AuditLog.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2.5">
          {EXPORT_REPORTS.map((rep) => (
            <Button
              key={rep.key}
              variant="outline"
              size="sm"
              disabled={downloading === rep.key}
              onClick={() => triggerExport(rep.key)}
            >
              <Download className="h-3.5 w-3.5" />
              {rep.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <DashboardOverviewClient initialData={initialData} />
    </div>
  );
}
