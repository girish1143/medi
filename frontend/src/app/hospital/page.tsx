import { ProtectedWorkspaceShell } from '@/components/auth/ProtectedWorkspaceShell';

export const dynamic = 'force-dynamic';

export default async function HospitalWorkspacePage() {
  return (
    <ProtectedWorkspaceShell
      title="Hospital Workspace"
      description="Protected server-verified workspace for verified hospitals and medical departments."
      allowedRoles={['HOSPITAL']}
    />
  );
}
