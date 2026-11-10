-- ============================================================================
-- Migration 0002: Identity, Admin Role Assignments & RBAC RLS Helpers
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    phone           TEXT,
    full_name       TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
    primary_role    public.app_role NOT NULL,
    account_status  public.account_status NOT NULL DEFAULT 'pending_verification',
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_email_normalized CHECK (email = lower(trim(email)))
);

CREATE UNIQUE INDEX uq_users_email ON public.users (email);
CREATE UNIQUE INDEX uq_users_phone ON public.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role_status ON public.users (primary_role, account_status);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Admin Role Grants (Dual-Lock Authorization for Administrative Staff)
-- ----------------------------------------------------------------------------

CREATE TABLE public.admin_roles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    admin_scope         public.admin_scope NOT NULL,
    granted_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    revocation_reason   TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_admin_roles_expiry CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT chk_admin_roles_revocation CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX uq_admin_roles_active_scope
    ON public.admin_roles (user_id, admin_scope)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_admin_roles_user_active
    ON public.admin_roles (user_id, admin_scope)
    WHERE revoked_at IS NULL;

CREATE TRIGGER trg_admin_roles_updated_at
    BEFORE UPDATE ON public.admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_admin_role_alignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_primary_role public.app_role;
BEGIN
    SELECT primary_role
      INTO v_primary_role
      FROM public.users
     WHERE id = NEW.user_id;

    IF v_primary_role IS NULL THEN
        RAISE EXCEPTION 'Target user % does not exist.', NEW.user_id;
    END IF;

    IF v_primary_role NOT IN ('super_admin', 'operations_admin', 'finance_admin', 'support_admin') THEN
        RAISE EXCEPTION 'Non-admin user (role: %) cannot hold an admin_roles assignment.', v_primary_role
            USING ERRCODE = '23514';
    END IF;

    IF v_primary_role::TEXT <> NEW.admin_scope::TEXT THEN
        RAISE EXCEPTION 'admin_scope (%) must match user primary_role (%).', NEW.admin_scope, v_primary_role
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_roles_alignment
    BEFORE INSERT OR UPDATE OF user_id, admin_scope ON public.admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_admin_role_alignment();

-- ----------------------------------------------------------------------------
-- Security-Definer RLS Helper Functions
-- Always evaluate auth.uid() directly; never accept caller-supplied user IDs.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_current_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.primary_role
      FROM public.users u
     WHERE u.id = auth.uid()
       AND u.account_status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.auth_has_admin_scope(p_scope public.admin_scope)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.admin_roles ar ON ar.user_id = u.id
         WHERE u.id = auth.uid()
           AND u.account_status = 'active'
           AND u.primary_role::TEXT = p_scope::TEXT
           AND ar.admin_scope = p_scope
           AND ar.revoked_at IS NULL
           AND (ar.expires_at IS NULL OR ar.expires_at > NOW())
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_any_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.admin_roles ar ON ar.user_id = u.id
         WHERE u.id = auth.uid()
           AND u.account_status = 'active'
           AND u.primary_role IN ('super_admin', 'operations_admin', 'finance_admin', 'support_admin')
           AND ar.admin_scope::TEXT = u.primary_role::TEXT
           AND ar.revoked_at IS NULL
           AND (ar.expires_at IS NULL OR ar.expires_at > NOW())
    );
$$;

REVOKE ALL ON FUNCTION public.auth_current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_role() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_has_admin_scope(public.admin_scope) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_admin_scope(public.admin_scope) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_any_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_any_admin() TO authenticated;
