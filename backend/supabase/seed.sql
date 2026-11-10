-- ===========================================================================
-- MediBook reference seed data (idempotent)
-- Demo users / appointments are created by src/scripts/seed.ts because they
-- require password hashing. This file is safe to run in production.
-- ===========================================================================

insert into specialties (name, slug, description, icon) values
  ('Cardiology', 'cardiology', 'Heart and cardiovascular care including preventive screening, angiography and rhythm disorders.', 'HeartPulse'),
  ('Dermatology', 'dermatology', 'Skin, hair and nail conditions with medical and cosmetic dermatology expertise.', 'Sparkles'),
  ('Neurology', 'neurology', 'Diagnosis and treatment of brain, spine and nervous system disorders.', 'Brain'),
  ('Orthopedics', 'orthopedics', 'Bone, joint and sports injury care with surgical and rehabilitation support.', 'Bone'),
  ('Pediatrics', 'pediatrics', 'Comprehensive health care for infants, children and adolescents.', 'Baby'),
  ('Gynecology', 'gynecology', 'Women''s health, pregnancy care and reproductive medicine.', 'Flower2'),
  ('Dentistry', 'dentistry', 'Preventive, restorative and cosmetic dental treatments.', 'Smile'),
  ('General Medicine', 'general-medicine', 'Primary care, chronic disease management and preventive health checks.', 'Stethoscope'),
  ('Ophthalmology', 'ophthalmology', 'Eye examinations, cataract surgery and vision correction.', 'Eye'),
  ('Psychiatry', 'psychiatry', 'Mental health assessment, therapy and medication management.', 'Activity')
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon;

insert into clinics (name, address_line1, area, city, state, pincode, phone, email, latitude, longitude) values
  ('MediBook Central Clinic', '14 Cunningham Road', 'Vasanth Nagar', 'Bengaluru', 'Karnataka', '560052', '+91 80 4000 1234', 'central@medibook.in', 12.989900, 77.594600),
  ('MediBook Whitefield', '221 ITPL Main Road', 'Whitefield', 'Bengaluru', 'Karnataka', '560066', '+91 80 4000 1235', 'whitefield@medibook.in', 12.969800, 77.750000),
  ('MediBook Andheri', '6 Link Road', 'Andheri West', 'Mumbai', 'Maharashtra', '400053', '+91 22 4000 2000', 'andheri@medibook.in', 19.136400, 72.829600),
  ('MediBook Saket', '32 Press Enclave Road', 'Saket', 'New Delhi', 'Delhi', '110017', '+91 11 4000 3000', 'saket@medibook.in', 28.524500, 77.206600),
  ('MediBook Banjara Hills', 'Road No. 12', 'Banjara Hills', 'Hyderabad', 'Telangana', '500034', '+91 40 4000 4000', 'hyderabad@medibook.in', 17.412600, 78.439100)
on conflict (name, city) do nothing;

insert into platform_settings (key, value, description) values
  ('booking_min_notice_minutes', '60', 'Minimum minutes between booking time and appointment start'),
  ('booking_max_advance_days', '60', 'Maximum number of days in advance a patient may book'),
  ('cancellation_min_hours', '4', 'Minimum hours before the appointment that cancellation is allowed'),
  ('reschedule_min_hours', '4', 'Minimum hours before the appointment that rescheduling is allowed'),
  ('pay_at_clinic_enabled', 'true', 'Allow patients to pay at the clinic instead of online'),
  ('auto_confirm_appointments', 'true', 'Automatically confirm paid bookings'),
  ('clinic_name', '"MediBook Health"', 'Brand name used in emails and invoices'),
  ('support_email', '"support@medibook.in"', 'Support mailbox'),
  ('support_phone', '"1800 123 4567"', 'Support phone number'),
  ('maintenance_mode', 'false', 'Temporarily disable new bookings'),
  ('refund_processing_days', '5', 'Expected refund settlement window')
on conflict (key) do nothing;
