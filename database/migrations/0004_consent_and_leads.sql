-- ============================================================================
-- Migration 0004: Patient Consents, Leads, Assignments & Immutable History
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

CREATE TABLE public.consent_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code    TEXT NOT NULL,
    consent_type    public.consent_type NOT NULL,
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    full_text_sha256 TEXT NOT NULL CHECK (full_text_sha256 ~ '^[a-f0-9]{64}$'),
    document_url    TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_consent_policy_window CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE UNIQUE INDEX uq_consent_policies_type_version
    ON public.consent_policies (consent_type, version_code);

CREATE INDEX idx_consent_policies_active
    ON public.consent_policies (consent_type, is_active, effective_from DESC);

-- ----------------------------------------------------------------------------
-- Leads (Healthcare Enquiries) & Patient Consents
-- Note: patient_consents.lead_id is added via ALTER TABLE after leads creation.
-- ----------------------------------------------------------------------------

CREATE TABLE public.patient_consents (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id                  UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    policy_id                   UUID NOT NULL REFERENCES public.consent_policies(id) ON DELETE RESTRICT,
    consent_type                public.consent_type NOT NULL,
    status                      public.consent_status NOT NULL DEFAULT 'granted',
    max_provider_disclosures    INTEGER NOT NULL DEFAULT 3 CHECK (max_provider_disclosures BETWEEN 1 AND 10),
    granted_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ,
    withdrawn_at                TIMESTAMPTZ,
    withdrawal_reason           TEXT,
    ip_hash                     TEXT,
    user_agent_hash             TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_consent_expiry CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT chk_consent_withdrawal CHECK (
        (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
        OR (status <> 'withdrawn' AND withdrawn_at IS NULL)
    )
);

CREATE INDEX idx_patient_consents_patient_status
    ON public.patient_consents (patient_id, consent_type, status);

CREATE TRIGGER trg_patient_consents_updated_at
    BEFORE UPDATE ON public.patient_consents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.leads (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id              UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    specialization_id       UUID NOT NULL REFERENCES public.specializations(id) ON DELETE RESTRICT,
    consent_id              UUID REFERENCES public.patient_consents(id) ON DELETE RESTRICT,
    urgency                 public.lead_urgency NOT NULL DEFAULT 'routine',
    consultation_mode       public.consultation_mode NOT NULL DEFAULT 'in_person',
    status                  public.lead_status NOT NULL DEFAULT 'consent_pending',
    preferred_city          TEXT NOT NULL,
    preferred_state         TEXT NOT NULL,
    country_code            CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    latitude                NUMERIC(9, 6),
    longitude               NUMERIC(9, 6),
    max_distance_km         INTEGER NOT NULL DEFAULT 25 CHECK (max_distance_km BETWEEN 1 AND 500),
    age_bracket             TEXT CHECK (age_bracket IS NULL OR age_bracket IN ('0-12', '13-17', '18-29', '30-44', '45-59', '60-74', '75+')),
    chief_complaint_summary TEXT NOT NULL CHECK (char_length(trim(chief_complaint_summary)) >= 10),
    clinical_context_notes  TEXT,
    preferred_language      TEXT NOT NULL DEFAULT 'en',
    budget_min_minor        BIGINT CHECK (budget_min_minor IS NULL OR budget_min_minor >= 0),
    budget_max_minor        BIGINT CHECK (budget_max_minor IS NULL OR budget_max_minor >= 0),
    currency                CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    source_channel          TEXT NOT NULL DEFAULT 'web_portal',
    idempotency_key         TEXT NOT NULL,
    qualified_at            TIMESTAMPTZ,
    qualified_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejection_reason        TEXT,
    closed_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lead_budget_bounds CHECK (
        budget_min_minor IS NULL OR budget_max_minor IS NULL OR budget_max_minor >= budget_min_minor
    ),
    CONSTRAINT chk_lead_budget_currency CHECK (
        (budget_min_minor IS NULL AND budget_max_minor IS NULL AND currency IS NULL)
        OR ((budget_min_minor IS NOT NULL OR budget_max_minor IS NOT NULL) AND currency IS NOT NULL)
    ),
    CONSTRAINT chk_lead_consent_gate CHECK (
        status IN ('draft', 'consent_pending', 'cancelled', 'rejected') OR consent_id IS NOT NULL
    )
);

ALTER TABLE public.patient_consents
    ADD COLUMN lead_id UUID REFERENCES public.leads(id) ON DELETE RESTRICT;

CREATE INDEX idx_patient_consents_lead
    ON public.patient_consents (lead_id, status)
    WHERE lead_id IS NOT NULL;

CREATE UNIQUE INDEX uq_leads_patient_idempotency
    ON public.leads (patient_id, idempotency_key);

CREATE INDEX idx_leads_status_urgency_created
    ON public.leads (status, urgency, created_at DESC);

CREATE INDEX idx_leads_matching_geo_spec
    ON public.leads (specialization_id, country_code, preferred_state, preferred_city, status);

CREATE INDEX idx_leads_patient_created
    ON public.leads (patient_id, created_at DESC);

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Lead Assignments (Exclusive Arc: Doctor OR Hospital)
-- ----------------------------------------------------------------------------

CREATE TABLE public.lead_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
    doctor_id           UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    hospital_id         UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    assignment_mode     public.assignment_mode NOT NULL DEFAULT 'auto',
    assigned_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    match_score         NUMERIC(5, 2) CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100)),
    match_reasons       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              public.assignment_status NOT NULL DEFAULT 'pending_acceptance',
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    responded_at        TIMESTAMPTZ,
    decline_reason      TEXT,
    revocation_reason   TEXT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lead_assignment_provider_xor CHECK (num_nonnulls(doctor_id, hospital_id) = 1),
    CONSTRAINT chk_lead_assignment_expiry CHECK (expires_at > assigned_at)
);

CREATE UNIQUE INDEX uq_lead_assignments_active_doctor
    ON public.lead_assignments (lead_id, doctor_id)
    WHERE doctor_id IS NOT NULL AND status NOT IN ('declined', 'expired', 'revoked');

CREATE UNIQUE INDEX uq_lead_assignments_active_hospital
    ON public.lead_assignments (lead_id, hospital_id)
    WHERE hospital_id IS NOT NULL AND status NOT IN ('declined', 'expired', 'revoked');

CREATE INDEX idx_lead_assignments_doctor_status
    ON public.lead_assignments (doctor_id, status, expires_at)
    WHERE doctor_id IS NOT NULL;

CREATE INDEX idx_lead_assignments_hospital_status
    ON public.lead_assignments (hospital_id, status, expires_at)
    WHERE hospital_id IS NOT NULL;

CREATE INDEX idx_lead_assignments_lead_status
    ON public.lead_assignments (lead_id, status);

CREATE TRIGGER trg_lead_assignments_updated_at
    BEFORE UPDATE ON public.lead_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Lead History (Append-Only Audit Trail of Lead State Transitions)
-- ----------------------------------------------------------------------------

CREATE TABLE public.lead_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id         UUID NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
    assignment_id   UUID REFERENCES public.lead_assignments(id) ON DELETE RESTRICT,
    actor_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_role      public.app_role,
    event_type      TEXT NOT NULL,
    from_status     public.lead_status,
    to_status       public.lead_status,
    reason          TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_history_lead_created
    ON public.lead_history (lead_id, created_at ASC);

CREATE TRIGGER trg_lead_history_immutable
    BEFORE UPDATE OR DELETE ON public.lead_history
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_immutable_row_mutation();

-- ----------------------------------------------------------------------------
-- Consent Verification Helper for RLS Policies
-- Returns TRUE only when the lead references a currently active, unwithdrawn,
-- unexpired provider_disclosure consent owned by the lead's patient.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_lead_has_active_consent(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.leads l
          JOIN public.patient_consents pc ON pc.id = l.consent_id
         WHERE l.id = p_lead_id
           AND pc.patient_id = l.patient_id
           AND pc.consent_type = 'provider_disclosure'
           AND pc.status = 'granted'
           AND pc.withdrawn_at IS NULL
           AND (pc.expires_at IS NULL OR pc.expires_at > NOW())
    );
$$;

REVOKE ALL ON FUNCTION public.auth_lead_has_active_consent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_lead_has_active_consent(UUID) TO authenticated;
