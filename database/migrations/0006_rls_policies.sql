-- ============================================================================
-- Migration 0006: Row Level Security (RLS) Policies & Column-Escalation Guards
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Anti-Privilege-Escalation Triggers (Prevent Self-Promotion / Self-Verify)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_user_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_privileged BOOLEAN;
BEGIN
    v_is_privileged := (
        current_user IN ('postgres', 'supabase_admin')
        OR auth.role() = 'service_role'
        OR public.auth_has_admin_scope('super_admin')
    );

    IF NOT v_is_privileged THEN
        IF NEW.primary_role IS DISTINCT FROM OLD.primary_role THEN
            RAISE EXCEPTION 'Insufficient privilege to modify primary_role.'
                USING ERRCODE = '42501';
        END IF;
        IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
            RAISE EXCEPTION 'Insufficient privilege to modify account_status.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_users_privileged_columns
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_user_privileged_columns();

CREATE OR REPLACE FUNCTION public.guard_provider_verification_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_verifier BOOLEAN;
BEGIN
    v_is_verifier := (
        current_user IN ('postgres', 'supabase_admin')
        OR auth.role() = 'service_role'
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

    IF NOT v_is_verifier THEN
        IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
           OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
           OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
           OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
            RAISE EXCEPTION 'Only Operations or Super Admins may change provider verification fields.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.is_accepting_leads = TRUE AND OLD.verification_status <> 'verified' THEN
            RAISE EXCEPTION 'Unverified providers cannot enable lead acceptance.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_doctors_verification
    BEFORE UPDATE ON public.doctors
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_provider_verification_columns();

CREATE TRIGGER trg_guard_hospitals_verification
    BEFORE UPDATE ON public.hospitals
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_provider_verification_columns();

-- ----------------------------------------------------------------------------
-- Security-Definer Ownership Helpers (Prevent Mutual RLS Recursion)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_current_patient_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id
      FROM public.patients p
      JOIN public.users u ON u.id = p.user_id
     WHERE p.user_id = auth.uid()
       AND u.account_status = 'active'
       AND u.primary_role = 'patient';
$$;

CREATE OR REPLACE FUNCTION public.auth_current_doctor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.id
      FROM public.doctors d
      JOIN public.users u ON u.id = d.user_id
     WHERE d.user_id = auth.uid()
       AND u.account_status = 'active'
       AND u.primary_role = 'doctor';
$$;

CREATE OR REPLACE FUNCTION public.auth_current_hospital_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.id
      FROM public.hospitals h
      JOIN public.users u ON u.id = h.user_id
     WHERE h.user_id = auth.uid()
       AND u.account_status = 'active'
       AND u.primary_role = 'hospital';
$$;

CREATE OR REPLACE FUNCTION public.auth_is_patient_of_lead(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.leads l
          JOIN public.patients p ON p.id = l.patient_id
          JOIN public.users u ON u.id = p.user_id
         WHERE l.id = p_lead_id
           AND p.user_id = auth.uid()
           AND u.account_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_provider_has_active_assignment(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.lead_assignments la
         WHERE la.lead_id = p_lead_id
           AND la.status IN ('pending_acceptance', 'accepted', 'completed')
           AND (
               la.doctor_id = public.auth_current_doctor_id()
               OR la.hospital_id = public.auth_current_hospital_id()
           )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_current_patient_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_patient_id() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_current_doctor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_doctor_id() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_current_hospital_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_hospital_id() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_patient_of_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_patient_of_lead(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_provider_has_active_assignment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_provider_has_active_assignment(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS Across All Public Tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. users & admin_roles
-- ----------------------------------------------------------------------------

CREATE POLICY users_select_self_or_authorized_admin
    ON public.users FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
        OR public.auth_has_admin_scope('support_admin')
    );

CREATE POLICY users_update_self_or_super_admin
    ON public.users FOR UPDATE TO authenticated
    USING (
        id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    )
    WITH CHECK (
        id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    );

CREATE POLICY admin_roles_select_self_or_super_admin
    ON public.admin_roles FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    );

CREATE POLICY admin_roles_manage_super_admin
    ON public.admin_roles FOR ALL TO authenticated
    USING (public.auth_has_admin_scope('super_admin'))
    WITH CHECK (public.auth_has_admin_scope('super_admin'));

-- ----------------------------------------------------------------------------
-- 2. specializations
-- ----------------------------------------------------------------------------

CREATE POLICY specializations_select_active_or_admin
    ON public.specializations FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY specializations_manage_ops_or_super
    ON public.specializations FOR ALL TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

-- ----------------------------------------------------------------------------
-- 3. patients (Strict PHI Protection: Providers Cannot Query Directly)
-- ----------------------------------------------------------------------------

CREATE POLICY patients_select_self_or_ops_super
    ON public.patients FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY patients_insert_self
    ON public.patients FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.auth_current_role() = 'patient'
    );

CREATE POLICY patients_update_self_or_super
    ON public.patients FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    );

-- ----------------------------------------------------------------------------
-- 4. hospitals & hospital_departments
-- ----------------------------------------------------------------------------

CREATE POLICY hospitals_select_verified_self_or_admin
    ON public.hospitals FOR SELECT TO authenticated
    USING (
        verification_status = 'verified'
        OR user_id = auth.uid()
        OR public.auth_is_any_admin()
    );

CREATE POLICY hospitals_insert_self
    ON public.hospitals FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.auth_current_role() = 'hospital'
    );

CREATE POLICY hospitals_update_self_ops_super
    ON public.hospitals FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY hospital_departments_select_public_verified_or_owner
    ON public.hospital_departments FOR SELECT TO authenticated
    USING (
        hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
        OR (
            is_active = TRUE
            AND EXISTS (
                SELECT 1
                  FROM public.hospitals h
                 WHERE h.id = hospital_departments.hospital_id
                   AND h.verification_status = 'verified'
            )
        )
    );

CREATE POLICY hospital_departments_manage_owner_ops_super
    ON public.hospital_departments FOR ALL TO authenticated
    USING (
        hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

-- ----------------------------------------------------------------------------
-- 5. doctors & doctor_specializations
-- ----------------------------------------------------------------------------

CREATE POLICY doctors_select_verified_self_or_admin
    ON public.doctors FOR SELECT TO authenticated
    USING (
        verification_status = 'verified'
        OR user_id = auth.uid()
        OR public.auth_is_any_admin()
    );

CREATE POLICY doctors_insert_self
    ON public.doctors FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.auth_current_role() = 'doctor'
    );

CREATE POLICY doctors_update_self_ops_super
    ON public.doctors FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY doctor_specializations_select_verified_owner_or_admin
    ON public.doctor_specializations FOR SELECT TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
        OR EXISTS (
            SELECT 1
              FROM public.doctors d
             WHERE d.id = doctor_specializations.doctor_id
               AND d.verification_status = 'verified'
        )
    );

CREATE POLICY doctor_specializations_manage_owner_ops_super
    ON public.doctor_specializations FOR ALL TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        doctor_id = public.auth_current_doctor_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

-- ----------------------------------------------------------------------------
-- 6. consent_policies & patient_consents
-- ----------------------------------------------------------------------------

CREATE POLICY consent_policies_select_active
    ON public.consent_policies FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY consent_policies_manage_super_admin
    ON public.consent_policies FOR ALL TO authenticated
    USING (public.auth_has_admin_scope('super_admin'))
    WITH CHECK (public.auth_has_admin_scope('super_admin'));

CREATE POLICY patient_consents_select_owner_or_ops_super
    ON public.patient_consents FOR SELECT TO authenticated
    USING (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY patient_consents_insert_owner
    ON public.patient_consents FOR INSERT TO authenticated
    WITH CHECK (
        patient_id = public.auth_current_patient_id()
    );

CREATE POLICY patient_consents_update_owner_or_super
    ON public.patient_consents FOR UPDATE TO authenticated
    USING (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
    )
    WITH CHECK (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
    );

-- ----------------------------------------------------------------------------
-- 7. leads, lead_assignments & lead_history (Consent-Gated Provider Access)
-- ----------------------------------------------------------------------------

CREATE POLICY leads_select_consent_and_role_gated
    ON public.leads FOR SELECT TO authenticated
    USING (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
        OR (
            public.auth_provider_has_active_assignment(id)
            AND public.auth_lead_has_active_consent(id)
        )
    );

CREATE POLICY leads_insert_patient_or_ops_super
    ON public.leads FOR INSERT TO authenticated
    WITH CHECK (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY leads_update_patient_or_ops_super
    ON public.leads FOR UPDATE TO authenticated
    USING (
        (
            patient_id = public.auth_current_patient_id()
            AND status IN ('draft', 'consent_pending', 'submitted')
        )
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        patient_id = public.auth_current_patient_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY lead_assignments_select_participants
    ON public.lead_assignments FOR SELECT TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_is_patient_of_lead(lead_id)
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY lead_assignments_insert_ops_super
    ON public.lead_assignments FOR INSERT TO authenticated
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY lead_assignments_update_provider_or_ops_super
    ON public.lead_assignments FOR UPDATE TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    )
    WITH CHECK (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY lead_history_select_patient_ops_super
    ON public.lead_history FOR SELECT TO authenticated
    USING (
        public.auth_is_patient_of_lead(lead_id)
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY lead_history_insert_ops_super
    ON public.lead_history FOR INSERT TO authenticated
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

-- ----------------------------------------------------------------------------
-- 8. Billing: subscription_plans, subscriptions, invoices, payments
-- ----------------------------------------------------------------------------

CREATE POLICY subscription_plans_select_active_or_finance_super
    ON public.subscription_plans FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY subscription_plans_manage_finance_super
    ON public.subscription_plans FOR ALL TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    )
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY subscriptions_select_provider_or_admin
    ON public.subscriptions FOR SELECT TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY subscriptions_manage_finance_super
    ON public.subscriptions FOR ALL TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    )
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY invoices_select_provider_or_finance_super
    ON public.invoices FOR SELECT TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY invoices_manage_finance_super
    ON public.invoices FOR ALL TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    )
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY payments_select_provider_or_finance_super
    ON public.payments FOR SELECT TO authenticated
    USING (
        doctor_id = public.auth_current_doctor_id()
        OR hospital_id = public.auth_current_hospital_id()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

CREATE POLICY payments_manage_finance_super
    ON public.payments FOR ALL TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    )
    WITH CHECK (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('finance_admin')
    );

-- ----------------------------------------------------------------------------
-- 9. notifications
-- ----------------------------------------------------------------------------

CREATE POLICY notifications_select_recipient_or_super
    ON public.notifications FOR SELECT TO authenticated
    USING (
        recipient_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    );

CREATE POLICY notifications_update_recipient_or_super
    ON public.notifications FOR UPDATE TO authenticated
    USING (
        recipient_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    )
    WITH CHECK (
        recipient_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
    );

-- ----------------------------------------------------------------------------
-- 10. support_tickets & support_ticket_messages
-- ----------------------------------------------------------------------------

CREATE POLICY support_tickets_select_requester_or_support
    ON public.support_tickets FOR SELECT TO authenticated
    USING (
        requester_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('support_admin')
        OR public.auth_has_admin_scope('operations_admin')
    );

CREATE POLICY support_tickets_insert_self
    ON public.support_tickets FOR INSERT TO authenticated
    WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY support_tickets_update_support_or_requester
    ON public.support_tickets FOR UPDATE TO authenticated
    USING (
        requester_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('support_admin')
    )
    WITH CHECK (
        requester_user_id = auth.uid()
        OR public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('support_admin')
    );

CREATE POLICY support_ticket_messages_select_visible
    ON public.support_ticket_messages FOR SELECT TO authenticated
    USING (
        public.auth_has_admin_scope('super_admin')
        OR public.auth_has_admin_scope('support_admin')
        OR (
            is_internal_note = FALSE
            AND EXISTS (
                SELECT 1
                  FROM public.support_tickets st
                 WHERE st.id = support_ticket_messages.ticket_id
                   AND st.requester_user_id = auth.uid()
            )
        )
    );

CREATE POLICY support_ticket_messages_insert_participants
    ON public.support_ticket_messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()
        AND (
            public.auth_has_admin_scope('super_admin')
            OR public.auth_has_admin_scope('support_admin')
            OR (
                is_internal_note = FALSE
                AND EXISTS (
                    SELECT 1
                      FROM public.support_tickets st
                     WHERE st.id = support_ticket_messages.ticket_id
                       AND st.requester_user_id = auth.uid()
                )
            )
        )
    );

-- ----------------------------------------------------------------------------
-- 11. audit_logs (Super Admin Read-Only; Writes Strictly via Backend Service Role)
-- ----------------------------------------------------------------------------

CREATE POLICY audit_logs_select_super_admin_only
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.auth_has_admin_scope('super_admin'));
