-- ============================================================================
-- Migration 0001: PostgreSQL Extensions, Domain Enums & Shared Trigger Functions
-- Target: Supabase PostgreSQL 15+
-- Policy: Pure DDL only. Zero dummy or seed records.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Domain Enumerated Types
-- ----------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'operations_admin',
    'finance_admin',
    'support_admin',
    'patient',
    'doctor',
    'hospital'
);

CREATE TYPE public.admin_scope AS ENUM (
    'super_admin',
    'operations_admin',
    'finance_admin',
    'support_admin'
);

CREATE TYPE public.account_status AS ENUM (
    'pending_verification',
    'active',
    'suspended',
    'deactivated'
);

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'under_review',
    'verified',
    'rejected',
    'suspended'
);

CREATE TYPE public.consultation_mode AS ENUM (
    'in_person',
    'teleconsultation',
    'both'
);

CREATE TYPE public.lead_urgency AS ENUM (
    'routine',
    'soon',
    'urgent',
    'emergency_redirected'
);

CREATE TYPE public.lead_status AS ENUM (
    'draft',
    'consent_pending',
    'submitted',
    'qualified',
    'matching',
    'assigned',
    'provider_accepted',
    'in_progress',
    'converted',
    'closed_unconverted',
    'cancelled',
    'rejected'
);

CREATE TYPE public.assignment_status AS ENUM (
    'pending_acceptance',
    'accepted',
    'declined',
    'expired',
    'revoked',
    'completed'
);

CREATE TYPE public.assignment_mode AS ENUM (
    'auto',
    'manual'
);

CREATE TYPE public.consent_type AS ENUM (
    'platform_triage',
    'provider_disclosure',
    'telehealth_communication'
);

CREATE TYPE public.consent_status AS ENUM (
    'granted',
    'withdrawn',
    'expired'
);

CREATE TYPE public.billing_cycle AS ENUM (
    'monthly',
    'quarterly',
    'annual'
);

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'cancelled',
    'expired'
);

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'void',
    'uncollectible'
);

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'requires_action',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded'
);

CREATE TYPE public.notification_channel AS ENUM (
    'in_app',
    'email',
    'sms',
    'push'
);

CREATE TYPE public.notification_status AS ENUM (
    'queued',
    'sent',
    'delivered',
    'failed',
    'read'
);

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_on_user',
    'resolved',
    'closed'
);

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

CREATE TYPE public.audit_outcome AS ENUM (
    'success',
    'denied',
    'failure'
);

-- ----------------------------------------------------------------------------
-- Shared Trigger Functions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_row_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Table %.% is append-only; % operations are prohibited.',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
        USING ERRCODE = '42501';
END;
$$;
