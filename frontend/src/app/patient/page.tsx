import { ProtectedWorkspaceShell } from '@/components/auth/ProtectedWorkspaceShell';

export const dynamic = 'force-dynamic';

export default async function PatientWorkspacePage() {
  return (
    <ProtectedWorkspaceShell
      title="Patient Workspace"
      description="Protected server-verified portal for patient healthcare enquiries and consent management."
      allowedRoles={['PATIENT']}
    />
  );
}
