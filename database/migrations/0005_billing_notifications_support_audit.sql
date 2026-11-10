-- ============================================================================
-- Migration 0005: Billing, Notifications, Support Tickets & Immutable Audit Logs
-- Target: Supabase PostgreSQL 15+
-- Security Note: No payment card numbers, CVVs, or raw PANs are stored.
-- ============================================================================

CREATE TABLE public.subscription_plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    description             TEXT,
    target_provider_type    TEXT NOT NULL CHECK (target_provider_type IN ('doctor', 'hospital', 'both')),
    billing_cycle           public.billing_cycle NOT NULL,
    price_minor             BIGINT NOT NULL CHECK (price_minor >= 0),
    currency                CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    monthly_lead_quota      INTEGER NOT NULL CHECK (monthly_lead_quota >= 0),
    features                JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_active
    ON public.subscription_plans (is_active, target_provider_type);

CREATE TRIGGER trg_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Subscriptions (Exclusive Arc: Doctor OR Hospital)
-- ----------------------------------------------------------------------------

CREATE TABLE public.subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                     UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    doctor_id                   UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    hospital_id                 UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    status                      public.subscription_status NOT NULL DEFAULT 'trialing',
    current_period_start        TIMESTAMPTZ NOT NULL,
    current_period_end          TIMESTAMPTZ NOT NULL,
    leads_allocated_in_period   INTEGER NOT NULL DEFAULT 0 CHECK (leads_allocated_in_period >= 0),
    leads_consumed_in_period    INTEGER NOT NULL DEFAULT 0 CHECK (leads_consumed_in_period >= 0),
    cancel_at_period_end        BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at                TIMESTAMPTZ,
    gateway_provider            TEXT,
    gateway_subscription_id     TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscription_provider_xor CHECK (num_nonnulls(doctor_id, hospital_id) = 1),
    CONSTRAINT chk_subscription_period CHECK (current_period_end > current_period_start),
    CONSTRAINT chk_subscription_quota CHECK (leads_consumed_in_period <= leads_allocated_in_period)
);

CREATE UNIQUE INDEX uq_subscriptions_live_doctor
    ON public.subscriptions (doctor_id)
    WHERE doctor_id IS NOT NULL AND status IN ('trialing', 'active', 'past_due');

CREATE UNIQUE INDEX uq_subscriptions_live_hospital
    ON public.subscriptions (hospital_id)
    WHERE hospital_id IS NOT NULL AND status IN ('trialing', 'active', 'past_due');

CREATE UNIQUE INDEX uq_subscriptions_gateway_ref
    ON public.subscriptions (gateway_provider, gateway_subscription_id)
    WHERE gateway_provider IS NOT NULL AND gateway_subscription_id IS NOT NULL;

CREATE INDEX idx_subscriptions_status_period
    ON public.subscriptions (status, current_period_end);

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Invoices & Tokenized Payments (Zero Card Detail Storage)
-- ----------------------------------------------------------------------------

CREATE TABLE public.invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      TEXT NOT NULL UNIQUE,
    subscription_id     UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    doctor_id           UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    hospital_id         UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    status              public.invoice_status NOT NULL DEFAULT 'draft',
    subtotal_minor      BIGINT NOT NULL CHECK (subtotal_minor >= 0),
    tax_minor           BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor         BIGINT NOT NULL CHECK (total_minor = subtotal_minor + tax_minor),
    currency            CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    issued_at           TIMESTAMPTZ,
    due_at              TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    pdf_storage_path    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_invoice_provider_xor CHECK (num_nonnulls(doctor_id, hospital_id) = 1),
    CONSTRAINT chk_invoice_period CHECK (period_end > period_start)
);

CREATE INDEX idx_invoices_doctor_status
    ON public.invoices (doctor_id, status, issued_at DESC)
    WHERE doctor_id IS NOT NULL;

CREATE INDEX idx_invoices_hospital_status
    ON public.invoices (hospital_id, status, issued_at DESC)
    WHERE hospital_id IS NOT NULL;

CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    subscription_id     UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    doctor_id           UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    hospital_id         UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    gateway_provider    TEXT NOT NULL,
    gateway_payment_id  TEXT NOT NULL,
    gateway_customer_id TEXT,
    payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('card_token', 'upi', 'ach', 'wire', 'netbanking', 'other')),
    amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
    refunded_minor      BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor),
    currency            CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status              public.payment_status NOT NULL DEFAULT 'pending',
    idempotency_key     TEXT NOT NULL UNIQUE,
    failure_code        TEXT,
    failure_message     TEXT,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_provider_xor CHECK (num_nonnulls(doctor_id, hospital_id) = 1)
);

CREATE UNIQUE INDEX uq_payments_gateway_ref
    ON public.payments (gateway_provider, gateway_payment_id);

CREATE INDEX idx_payments_invoice
    ON public.payments (invoice_id, status);

CREATE INDEX idx_payments_doctor
    ON public.payments (doctor_id, created_at DESC)
    WHERE doctor_id IS NOT NULL;

CREATE INDEX idx_payments_hospital
    ON public.payments (hospital_id, created_at DESC)
    WHERE hospital_id IS NOT NULL;

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Notifications
-- ----------------------------------------------------------------------------

CREATE TABLE public.notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel             public.notification_channel NOT NULL,
    template_key        TEXT NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              public.notification_status NOT NULL DEFAULT 'queued',
    related_entity_type TEXT,
    related_entity_id   UUID,
    sent_at             TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    failed_reason       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_unread
    ON public.notifications (recipient_user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX idx_notifications_dispatch_queue
    ON public.notifications (status, channel, created_at ASC)
    WHERE status = 'queued';

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Support Tickets & Messages
-- ----------------------------------------------------------------------------

CREATE TABLE public.support_tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number       TEXT NOT NULL UNIQUE,
    requester_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    assigned_admin_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    lead_id             UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    category            TEXT NOT NULL,
    priority            public.ticket_priority NOT NULL DEFAULT 'medium',
    status              public.ticket_status NOT NULL DEFAULT 'open',
    subject             TEXT NOT NULL CHECK (char_length(trim(subject)) >= 3),
    description         TEXT NOT NULL CHECK (char_length(trim(description)) >= 10),
    resolved_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_tickets_requester
    ON public.support_tickets (requester_user_id, status, created_at DESC);

CREATE INDEX idx_support_tickets_queue
    ON public.support_tickets (status, priority, assigned_admin_id, created_at ASC);

CREATE TRIGGER trg_support_tickets_updated_at
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_ticket_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    message_body    TEXT NOT NULL CHECK (char_length(trim(message_body)) >= 1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_ticket_messages_ticket
    ON public.support_ticket_messages (ticket_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- Immutable Audit Logs
-- ----------------------------------------------------------------------------

CREATE TABLE public.audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_role      public.app_role,
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     UUID,
    outcome         public.audit_outcome NOT NULL DEFAULT 'success',
    request_id      TEXT,
    ip_hash         TEXT,
    user_agent_hash TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created
    ON public.audit_logs (created_at DESC);

CREATE INDEX idx_audit_logs_actor
    ON public.audit_logs (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_audit_logs_resource
    ON public.audit_logs (resource_type, resource_id, created_at DESC);

CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_immutable_row_mutation();
