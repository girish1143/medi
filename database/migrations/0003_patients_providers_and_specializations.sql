-- ============================================================================
-- Migration 0003: Specializations, Patients, Hospitals, Departments & Doctors
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

CREATE TABLE public.specializations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES public.specializations(id) ON DELETE SET NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_specialization_code_format CHECK (code ~ '^[A-Z0-9_]{2,64}$'),
    CONSTRAINT chk_specialization_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX uq_specializations_code ON public.specializations (code);
CREATE UNIQUE INDEX uq_specializations_name ON public.specializations (lower(name));
CREATE INDEX idx_specializations_active_parent ON public.specializations (is_active, parent_id);

CREATE TRIGGER trg_specializations_updated_at
    BEFORE UPDATE ON public.specializations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Patients (Protected Profile & Geographic Preferences)
-- ----------------------------------------------------------------------------

CREATE TABLE public.patients (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    date_of_birth           DATE,
    gender                  TEXT CHECK (gender IS NULL OR gender IN ('female', 'male', 'non_binary', 'prefer_not_to_say', 'other')),
    preferred_language      TEXT NOT NULL DEFAULT 'en',
    city                    TEXT,
    state_province          TEXT,
    postal_code             TEXT,
    country_code            CHAR(2) CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    latitude                NUMERIC(9, 6),
    longitude               NUMERIC(9, 6),
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,
    marketing_opt_in        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_patient_dob_past CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)
);

CREATE INDEX idx_patients_location ON public.patients (country_code, state_province, city);

CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Hospitals & Departments
-- ----------------------------------------------------------------------------

CREATE TABLE public.hospitals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    legal_name              TEXT NOT NULL CHECK (char_length(trim(legal_name)) >= 2),
    display_name            TEXT NOT NULL CHECK (char_length(trim(display_name)) >= 2),
    registration_number     TEXT NOT NULL,
    accreditation_body      TEXT,
    accreditation_number    TEXT,
    verification_status     public.verification_status NOT NULL DEFAULT 'pending',
    verified_at             TIMESTAMPTZ,
    verified_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejection_reason        TEXT,
    is_accepting_leads      BOOLEAN NOT NULL DEFAULT FALSE,
    offers_teleconsultation BOOLEAN NOT NULL DEFAULT FALSE,
    address_line_1          TEXT NOT NULL,
    address_line_2          TEXT,
    city                    TEXT NOT NULL,
    state_province          TEXT NOT NULL,
    postal_code             TEXT NOT NULL,
    country_code            CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    latitude                NUMERIC(9, 6),
    longitude               NUMERIC(9, 6),
    contact_email           TEXT NOT NULL,
    contact_phone           TEXT NOT NULL,
    website_url             TEXT,
    bed_capacity            INTEGER CHECK (bed_capacity IS NULL OR bed_capacity >= 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_hospitals_country_reg_number
    ON public.hospitals (country_code, registration_number);

CREATE INDEX idx_hospitals_matching_eligibility
    ON public.hospitals (verification_status, is_accepting_leads, country_code, state_province, city);

CREATE TRIGGER trg_hospitals_updated_at
    BEFORE UPDATE ON public.hospitals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hospital_departments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id         UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
    specialization_id   UUID NOT NULL REFERENCES public.specializations(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    head_doctor_name    TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_accepting_leads  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_hospital_departments_hospital_name
    ON public.hospital_departments (hospital_id, lower(name));

CREATE UNIQUE INDEX uq_hospital_departments_hospital_spec
    ON public.hospital_departments (hospital_id, specialization_id);

CREATE INDEX idx_hospital_departments_spec_active
    ON public.hospital_departments (specialization_id, is_active, is_accepting_leads);

CREATE TRIGGER trg_hospital_departments_updated_at
    BEFORE UPDATE ON public.hospital_departments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Doctors & Doctor Specializations
-- ----------------------------------------------------------------------------

CREATE TABLE public.doctors (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    primary_hospital_id     UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    medical_license_number  TEXT NOT NULL,
    licensing_authority     TEXT NOT NULL,
    license_country_code    CHAR(2) NOT NULL CHECK (license_country_code ~ '^[A-Z]{2}$'),
    license_expires_at      DATE,
    verification_status     public.verification_status NOT NULL DEFAULT 'pending',
    verified_at             TIMESTAMPTZ,
    verified_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejection_reason        TEXT,
    qualification_summary   TEXT,
    years_of_experience     INTEGER NOT NULL DEFAULT 0 CHECK (years_of_experience >= 0),
    consultation_mode       public.consultation_mode NOT NULL DEFAULT 'in_person',
    consultation_fee_minor  BIGINT CHECK (consultation_fee_minor IS NULL OR consultation_fee_minor >= 0),
    currency                CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    is_accepting_leads      BOOLEAN NOT NULL DEFAULT FALSE,
    city                    TEXT NOT NULL,
    state_province          TEXT NOT NULL,
    country_code            CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    latitude                NUMERIC(9, 6),
    longitude               NUMERIC(9, 6),
    bio                     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_doctor_fee_currency CHECK (
        (consultation_fee_minor IS NULL AND currency IS NULL)
        OR (consultation_fee_minor IS NOT NULL AND currency IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_doctors_license
    ON public.doctors (license_country_code, medical_license_number);

CREATE INDEX idx_doctors_matching_eligibility
    ON public.doctors (verification_status, is_accepting_leads, country_code, state_province, city);

CREATE INDEX idx_doctors_hospital
    ON public.doctors (primary_hospital_id)
    WHERE primary_hospital_id IS NOT NULL;

CREATE TRIGGER trg_doctors_updated_at
    BEFORE UPDATE ON public.doctors
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.doctor_specializations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id           UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    specialization_id   UUID NOT NULL REFERENCES public.specializations(id) ON DELETE RESTRICT,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    board_certified     BOOLEAN NOT NULL DEFAULT FALSE,
    years_experience    INTEGER CHECK (years_experience IS NULL OR years_experience >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_doctor_specializations_pair
    ON public.doctor_specializations (doctor_id, specialization_id);

CREATE UNIQUE INDEX uq_doctor_primary_specialization
    ON public.doctor_specializations (doctor_id)
    WHERE is_primary = TRUE;

CREATE INDEX idx_doctor_specializations_spec
    ON public.doctor_specializations (specialization_id, doctor_id);
