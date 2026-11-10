import { ProtectedWorkspaceShell } from '@/components/auth/ProtectedWorkspaceShell';

export const dynamic = 'force-dynamic';

export default async function DoctorWorkspacePage() {
  return (
    <ProtectedWorkspaceShell
      title="Doctor Workspace"
      description="Protected server-verified workspace for verified medical specialists."
      allowedRoles={['DOCTOR']}
    />
  );
}
