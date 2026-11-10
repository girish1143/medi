import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { query } from './database';
import { logger } from './logger';
import { env } from './env';
import { addDaysToDateStr, istToday, istToUtc } from '../utils/time';

const DEMO_PASSWORDS = {
  admin: 'Admin@12345',
  doctor: 'Doctor@12345',
  reception: 'Reception@12345',
  patient: 'Patient@12345',
};

interface ClinicRow { id: string; name: string }
interface SpecialtyRow { id: string; slug: string }

const DOCTORS = [
  {
    profileId: 'd0000000-0000-4000-8000-000000000001',
    doctorId: 'e0000000-0000-4000-8000-000000000001',
    fullName: 'Dr. Arjun Mehta',
    email: 'arjun.mehta@medibook.in',
    phone: '9845012001',
    registration: 'KMC-48219',
    qualification: 'MBBS, MD (Cardiology)',
    experience: 14,
    fee: 900,
    specialty: 'cardiology',
    clinic: 'MediBook Central Clinic',
    bio: 'Interventional cardiologist focused on preventive heart care, complex angioplasty and long-term hypertension management. Believes in explaining every treatment option in plain language.',
    languages: ['English', 'Hindi', 'Kannada'],
    slots: 20,
    start: '09:30',
    end: '17:30',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000002',
    doctorId: 'e0000000-0000-4000-8000-000000000002',
    fullName: 'Dr. Neha Kapoor',
    email: 'neha.kapoor@medibook.in',
    phone: '9845012002',
    registration: 'KMC-51882',
    qualification: 'MBBS, MD (Dermatology)',
    experience: 9,
    fee: 700,
    specialty: 'dermatology',
    clinic: 'MediBook Whitefield',
    bio: 'Medical and cosmetic dermatologist treating acne, pigmentation, hair loss and chronic skin conditions with evidence-based protocols.',
    languages: ['English', 'Hindi', 'Punjabi'],
    slots: 20,
    start: '10:00',
    end: '18:00',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000003',
    doctorId: 'e0000000-0000-4000-8000-000000000003',
    fullName: 'Dr. Vikram Rao',
    email: 'vikram.rao@medibook.in',
    phone: '9820012003',
    registration: 'MMC-37210',
    qualification: 'MBBS, DM (Neurology)',
    experience: 17,
    fee: 1200,
    specialty: 'neurology',
    clinic: 'MediBook Andheri',
    bio: 'Neurologist specialising in stroke prevention, epilepsy and headache disorders. Leads a dedicated stroke response unit.',
    languages: ['English', 'Hindi', 'Marathi'],
    slots: 30,
    start: '09:00',
    end: '16:00',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000004',
    doctorId: 'e0000000-0000-4000-8000-000000000004',
    fullName: 'Dr. Sneha Iyer',
    email: 'sneha.iyer@medibook.in',
    phone: '9845012004',
    registration: 'KMC-44990',
    qualification: 'MBBS, DCH, DNB (Pediatrics)',
    experience: 11,
    fee: 600,
    specialty: 'pediatrics',
    clinic: 'MediBook Central Clinic',
    bio: 'Pediatrician and newborn care specialist. Focused on growth monitoring, vaccination schedules and gentle care for anxious first-time parents.',
    languages: ['English', 'Tamil', 'Kannada'],
    slots: 15,
    start: '09:00',
    end: '16:00',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000005',
    doctorId: 'e0000000-0000-4000-8000-000000000005',
    fullName: 'Dr. Rohan Desai',
    email: 'rohan.desai@medibook.in',
    phone: '9810012005',
    registration: 'DMC-29031',
    qualification: 'MBBS, MS (Orthopedics)',
    experience: 12,
    fee: 850,
    specialty: 'orthopedics',
    clinic: 'MediBook Saket',
    bio: 'Sports injury and joint replacement surgeon. Uses minimally invasive techniques and structured rehabilitation plans.',
    languages: ['English', 'Hindi', 'Gujarati'],
    slots: 30,
    start: '10:30',
    end: '18:30',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000006',
    doctorId: 'e0000000-0000-4000-8000-000000000006',
    fullName: 'Dr. Meera Nair',
    email: 'meera.nair@medibook.in',
    phone: '9849012006',
    registration: 'TSMC-41128',
    qualification: 'MBBS, MS (Obstetrics & Gynecology)',
    experience: 15,
    fee: 950,
    specialty: 'gynecology',
    clinic: 'MediBook Banjara Hills',
    bio: 'Obstetrician and gynecologist providing complete pregnancy care, fertility counselling and minimally invasive gynecological surgery.',
    languages: ['English', 'Telugu', 'Malayalam'],
    slots: 30,
    start: '09:30',
    end: '17:00',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000007',
    doctorId: 'e0000000-0000-4000-8000-000000000007',
    fullName: 'Dr. Kabir Singh',
    email: 'kabir.singh@medibook.in',
    phone: '9845012007',
    registration: 'KMC-60112',
    qualification: 'MBBS, MD (General Medicine)',
    experience: 8,
    fee: 500,
    specialty: 'general-medicine',
    clinic: 'MediBook Whitefield',
    bio: 'Primary care physician managing diabetes, thyroid disorders and preventive health checks with a lifestyle-first approach.',
    languages: ['English', 'Hindi', 'Kannada'],
    slots: 15,
    start: '09:00',
    end: '18:00',
    verified: true,
  },
  {
    profileId: 'd0000000-0000-4000-8000-000000000008',
    doctorId: 'e0000000-0000-4000-8000-000000000008',
    fullName: 'Dr. Aditi Verma',
    email: 'aditi.verma@medibook.in',
    phone: '9845012008',
    registration: 'KMC-67445',
    qualification: 'BDS, MDS (Prosthodontics)',
    experience: 6,
    fee: 400,
    specialty: 'dentistry',
    clinic: 'MediBook Central Clinic',
    bio: 'Prosthodontist offering crowns, implants and smile rehabilitation with a calm, pain-conscious approach.',
    languages: ['English', 'Hindi'],
    slots: 30,
    start: '10:00',
    end: '17:00',
    verified: false,
  },
];

const PATIENTS = [
  {
    profileId: 'b0000000-0000-4000-8000-000000000001',
    patientId: 'c0000000-0000-4000-8000-000000000001',
    fullName: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phone: '9876543210',
    dob: '1992-04-18',
    gender: 'female',
    bloodGroup: 'O+',
    address: '204, Palm Grove Apartments, Indiranagar, Bengaluru 560038',
    emergency: '9812345678',
  },
  {
    profileId: 'b0000000-0000-4000-8000-000000000002',
    patientId: 'c0000000-0000-4000-8000-000000000002',
    fullName: 'Rohan Verma',
    email: 'rohan.verma@example.com',
    phone: '9876543211',
    dob: '1987-11-02',
    gender: 'male',
    bloodGroup: 'B+',
    address: '12, Hill Crest Road, Bandra West, Mumbai 400050',
    emergency: '9823456789',
  },
  {
    profileId: 'b0000000-0000-4000-8000-000000000003',
    patientId: 'c0000000-0000-4000-8000-000000000003',
    fullName: 'Ananya Iyer',
    email: 'ananya.iyer@example.com',
    phone: '9876543212',
    dob: '1998-01-25',
    gender: 'female',
    bloodGroup: 'A+',
    address: '45, Lake View Layout, Koramangala, Bengaluru 560034',
    emergency: '9834567890',
  },
];

async function ensureUser(input: {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'patient' | 'doctor' | 'admin' | 'receptionist';
  password: string;
}): Promise<boolean> {
  const existing = await query('select 1 from profiles where id = $1', [input.id]);
  if (existing.rowCount) return false;

  const hash = await bcrypt.hash(input.password, 10);
  await query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
    input.id,
    input.email,
  ]);
  await query(
    `insert into profiles (id, full_name, email, phone, role, avatar_url)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [input.id, input.fullName, input.email, input.phone, input.role, null],
  );
  await query(
    `insert into dev_credentials (profile_id, password_hash) values ($1, $2)
     on conflict (profile_id) do nothing`,
    [input.id, hash],
  );
  return true;
}

async function ensureMedicalRecordFile(patientId: string): Promise<string> {
  const relative = `seed/${patientId}/lab-report.pdf`;
  const target = path.resolve(__dirname, '../../', env.LOCAL_STORAGE_DIR, 'medical-records', relative);
  try {
    await fs.access(target);
    return relative;
  } catch {
    // create below
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  doc.fontSize(20).fillColor('#0B5FFF').text('MediBook Diagnostics');
  doc.moveDown().fontSize(12).fillColor('#0F172A').text('Complete Blood Count (CBC) — Sample Report');
  doc.moveDown().fontSize(10).text('Patient: Priya Sharma   |   Collected: 02 Nov 2026');
  doc.moveDown().text('Haemoglobin: 13.4 g/dL (Reference 12.0 - 15.5)');
  doc.text('WBC: 7,200 /µL (Reference 4,000 - 11,000)');
  doc.text('Platelets: 2.4 lakh/µL (Reference 1.5 - 4.1 lakh)');
  doc.moveDown().text('Impression: Values within normal reference ranges.');
  doc.end();
  await finished;
  await fs.writeFile(target, Buffer.concat(chunks));
  return relative;
}

/**
 * Idempotent development seed. Reference data is always ensured; demo
 * transactional data is only created when the appointments table is empty.
 */
export async function seedDemoData(): Promise<void> {
  const specialties = await query<SpecialtyRow>('select id, slug from specialties');
  const clinics = await query<ClinicRow>('select id, name from clinics');
  if (specialties.rowCount === 0 || clinics.rowCount === 0) {
    logger.warn('Reference data missing - skipping demo seed');
    return;
  }
  const specialtyBySlug = new Map(specialties.rows.map((r) => [r.slug, r.id]));
  const clinicByName = new Map(clinics.rows.map((r) => [r.name, r.id]));

  await ensureUser({
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin@medibook.in',
    fullName: 'Aarav Malhotra',
    phone: '9800000001',
    role: 'admin',
    password: DEMO_PASSWORDS.admin,
  });
  await ensureUser({
    id: 'a0000000-0000-4000-8000-000000000002',
    email: 'reception@medibook.in',
    fullName: 'Kavya Menon',
    phone: '9800000002',
    role: 'receptionist',
    password: DEMO_PASSWORDS.reception,
  });

  for (const [index, doctor] of DOCTORS.entries()) {
    await ensureUser({
      id: doctor.profileId,
      email: doctor.email,
      fullName: doctor.fullName,
      phone: doctor.phone,
      role: 'doctor',
      password: DEMO_PASSWORDS.doctor,
    });

    await query(
      `insert into doctors (id, profile_id, registration_number, qualification, experience_years,
                            biography, languages, consultation_fee, online_consultation_fee,
                            verification_status, verified_at, is_active, average_rating, total_reviews)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13)
       on conflict (id) do nothing`,
      [
        doctor.doctorId,
        doctor.profileId,
        doctor.registration,
        doctor.qualification,
        doctor.experience,
        doctor.bio,
        doctor.languages,
        doctor.fee,
        Math.round(doctor.fee * 0.85),
        doctor.verified ? 'verified' : 'pending',
        doctor.verified ? new Date() : null,
        [4.9, 4.8, 4.9, 4.7, 4.8, 4.9, 4.6, 4.5][index] ?? 4.7,
        [128, 84, 96, 142, 73, 110, 65, 9][index] ?? 20,
      ],
    );

    const specialtyId = specialtyBySlug.get(doctor.specialty);
    if (specialtyId) {
      await query(
        `insert into doctor_specialties (doctor_id, specialty_id, is_primary)
         values ($1, $2, true) on conflict do nothing`,
        [doctor.doctorId, specialtyId],
      );
    }

    const clinicId = clinicByName.get(doctor.clinic);
    if (clinicId) {
      await query(
        `insert into doctor_clinics (doctor_id, clinic_id, consultation_fee, is_primary)
         values ($1, $2, $3, true) on conflict do nothing`,
        [doctor.doctorId, clinicId, doctor.fee],
      );
    }

    const availability = await query('select 1 from doctor_availability where doctor_id = $1 limit 1', [
      doctor.doctorId,
    ]);
    if (availability.rowCount === 0) {
      for (const weekday of [1, 2, 3, 4, 5, 6]) {
        await query(
          `insert into doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end)
           values ($1, $2, $3, $4, $5, '13:00', '14:00')`,
          [doctor.doctorId, weekday, doctor.start, doctor.end, doctor.slots],
        );
      }
    }
  }

  for (const patient of PATIENTS) {
    await ensureUser({
      id: patient.profileId,
      email: patient.email,
      fullName: patient.fullName,
      phone: patient.phone,
      role: 'patient',
      password: DEMO_PASSWORDS.patient,
    });
    await query(
      `insert into patients (id, profile_id, date_of_birth, gender, blood_group, emergency_contact, address)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [
        patient.patientId,
        patient.profileId,
        patient.dob,
        patient.gender,
        patient.bloodGroup,
        patient.emergency,
        patient.address,
      ],
    );
  }

  const existing = await query<{ count: string }>('select count(*)::text as count from appointments');
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    logger.info('Demo appointments already present');
    return;
  }

  const today = istToday();
  const at = (offsetDays: number, time: string) => istToUtc(addDaysToDateStr(today, offsetDays), time);
  const centralClinic = clinicByName.get('MediBook Central Clinic')!;
  const whitefieldClinic = clinicByName.get('MediBook Whitefield')!;
  const andheriClinic = clinicByName.get('MediBook Andheri')!;
  const saketClinic = clinicByName.get('MediBook Saket')!;

  const appointmentRows = [
    {
      id: 'f0000000-0000-4000-8000-000000000001',
      number: 'MB-260001',
      patientId: PATIENTS[0].patientId,
      doctorId: DOCTORS[0].doctorId,
      clinicId: centralClinic,
      start: at(-12, '10:00'),
      end: at(-12, '10:20'),
      type: 'in_clinic',
      status: 'completed',
      fee: 900,
      paymentStatus: 'paid',
      reason: 'Follow-up for elevated blood pressure and routine cardiac review.',
      notes: 'BP well controlled at 126/82. Continue current medication. Review lipid profile in 3 months.',
    },
    {
      id: 'f0000000-0000-4000-8000-000000000002',
      number: 'MB-260002',
      patientId: PATIENTS[0].patientId,
      doctorId: DOCTORS[1].doctorId,
      clinicId: whitefieldClinic,
      start: at(-30, '15:00'),
      end: at(-30, '15:20'),
      type: 'in_clinic',
      status: 'completed',
      fee: 700,
      paymentStatus: 'paid',
      reason: 'Recurring skin allergy and pigmentation on forearms.',
      notes: 'Mild contact dermatitis. Avoid fragrance-based products. Review in 4 weeks if symptoms persist.',
    },
    {
      id: 'f0000000-0000-4000-8000-000000000003',
      number: 'MB-260003',
      patientId: PATIENTS[1].patientId,
      doctorId: DOCTORS[4].doctorId,
      clinicId: saketClinic,
      start: at(-20, '11:30'),
      end: at(-20, '12:00'),
      type: 'in_clinic',
      status: 'completed',
      fee: 850,
      paymentStatus: 'paid',
      reason: 'Knee pain after weekend football; difficulty climbing stairs.',
      notes: 'Grade I medial collateral ligament strain. Physiotherapy for 4 weeks. Avoid impact activity.',
    },
    {
      id: 'f0000000-0000-4000-8000-000000000004',
      number: 'MB-260004',
      patientId: PATIENTS[2].patientId,
      doctorId: DOCTORS[3].doctorId,
      clinicId: centralClinic,
      start: at(-8, '09:30'),
      end: at(-8, '09:45'),
      type: 'in_clinic',
      status: 'completed',
      fee: 600,
      paymentStatus: 'paid',
      reason: 'Routine vaccination and growth check for 3-year-old child.',
      notes: 'Growth parameters on track. Next vaccination due in 8 weeks.',
    },
    {
      id: 'f0000000-0000-4000-8000-000000000005',
      number: 'MB-260005',
      patientId: PATIENTS[0].patientId,
      doctorId: DOCTORS[0].doctorId,
      clinicId: centralClinic,
      start: at(1, '10:00'),
      end: at(1, '10:20'),
      type: 'in_clinic',
      status: 'confirmed',
      fee: 900,
      paymentStatus: 'paid',
      reason: 'Cardiology follow-up and review of recent ECG report.',
      notes: null,
    },
    {
      id: 'f0000000-0000-4000-8000-000000000006',
      number: 'MB-260006',
      patientId: PATIENTS[1].patientId,
      doctorId: DOCTORS[2].doctorId,
      clinicId: andheriClinic,
      start: at(2, '11:00'),
      end: at(2, '11:30'),
      type: 'in_clinic',
      status: 'confirmed',
      fee: 1200,
      paymentStatus: 'paid',
      reason: 'Frequent migraine episodes with visual aura.',
      notes: null,
    },
    {
      id: 'f0000000-0000-4000-8000-000000000007',
      number: 'MB-260007',
      patientId: PATIENTS[2].patientId,
      doctorId: DOCTORS[3].doctorId,
      clinicId: centralClinic,
      start: at(3, '11:00'),
      end: at(3, '11:15'),
      type: 'in_clinic',
      status: 'confirmed',
      fee: 600,
      paymentStatus: 'pending',
      reason: 'Persistent cough for one week.',
      notes: null,
    },
    {
      id: 'f0000000-0000-4000-8000-000000000008',
      number: 'MB-260008',
      patientId: PATIENTS[1].patientId,
      doctorId: DOCTORS[6].doctorId,
      clinicId: whitefieldClinic,
      start: at(-5, '12:00'),
      end: at(-5, '12:15'),
      type: 'in_clinic',
      status: 'cancelled',
      fee: 500,
      paymentStatus: 'refunded',
      reason: 'Annual health check consultation.',
      notes: null,
    },
    {
      id: 'f0000000-0000-4000-8000-000000000009',
      number: 'MB-260009',
      patientId: PATIENTS[2].patientId,
      doctorId: DOCTORS[5].doctorId,
      clinicId: clinicByName.get('MediBook Banjara Hills')!,
      start: at(4, '10:30'),
      end: at(4, '11:00'),
      type: 'online',
      status: 'pending',
      fee: 950,
      paymentStatus: 'pending',
      reason: 'Online consultation for irregular cycles.',
      notes: null,
    },
  ];

  for (const appointment of appointmentRows) {
    await query(
      `insert into appointments
        (id, appointment_number, patient_id, doctor_id, clinic_id, starts_at, ends_at,
         appointment_type, status, consultation_fee, payment_status, reason, doctor_notes,
         completed_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       on conflict (appointment_number) do nothing`,
      [
        appointment.id,
        appointment.number,
        appointment.patientId,
        appointment.doctorId,
        appointment.clinicId,
        appointment.start,
        appointment.end,
        appointment.type,
        appointment.status,
        appointment.fee,
        appointment.paymentStatus,
        appointment.reason,
        appointment.notes,
        appointment.status === 'completed' ? appointment.end : null,
        PATIENTS.find((p) => p.patientId === appointment.patientId)?.profileId ?? null,
      ],
    );

    await query(
      `insert into appointment_status_history (appointment_id, to_status, note, created_at)
       select $1, $2, 'Demo booking created', $3
       where not exists (select 1 from appointment_status_history where appointment_id = $1)`,
      [appointment.id, appointment.status === 'pending' ? 'pending' : appointment.status, appointment.start],
    );
  }

  const payments = [
    ['f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', PATIENTS[0].patientId, 900, 'captured', 12],
    ['f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', PATIENTS[0].patientId, 700, 'captured', 30],
    ['f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003', PATIENTS[1].patientId, 850, 'captured', 20],
    ['f1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', PATIENTS[2].patientId, 600, 'captured', 8],
    ['f1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005', PATIENTS[0].patientId, 900, 'captured', -1],
    ['f1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000006', PATIENTS[1].patientId, 1200, 'captured', -2],
  ] as const;

  for (const [id, appointmentId, patientId, amount, status, daysOffset] of payments) {
    await query(
      `insert into payments (id, appointment_id, patient_id, amount, currency, payment_provider,
                             provider_order_id, provider_payment_id, status, paid_at, idempotency_key)
       values ($1, $2, $3, $4, 'INR', 'razorpay', $5, $6, $7, now() - ($8 || ' days')::interval, $9)
       on conflict (id) do nothing`,
      [
        id,
        appointmentId,
        patientId,
        amount,
        `order_seed_${id.slice(-4)}`,
        `pay_seed_${id.slice(-4)}`,
        status,
        String(daysOffset),
        `seed-payment-${id}`,
      ],
    );
  }

  await query(
    `insert into payments (id, appointment_id, patient_id, amount, currency, payment_provider, status, idempotency_key)
     values ('f1000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000007',
             $1, 600, 'INR', 'pay_at_clinic', 'created', 'seed-payment-pay-at-clinic')
     on conflict (id) do nothing`,
    [PATIENTS[2].patientId],
  );

  await query(
    `insert into refunds (id, payment_id, appointment_id, amount, reason, status, requested_by, processed_by, processed_at)
     values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000005',
             'f0000000-0000-4000-8000-000000000008', 500, 'Patient cancelled within free cancellation window',
             'processed', $1, 'a0000000-0000-4000-8000-000000000001', now() - interval '4 days')
     on conflict (id) do nothing`,
    [PATIENTS[1].profileId],
  );

  // Prescriptions for the completed cardiology and dermatology visits.
  const prescriptions = [
    {
      id: 'f3000000-0000-4000-8000-000000000001',
      number: 'RX-260001',
      appointmentId: 'f0000000-0000-4000-8000-000000000001',
      patientId: PATIENTS[0].patientId,
      doctorId: DOCTORS[0].doctorId,
      diagnosis: 'Essential hypertension, well controlled',
      notes: 'Continue low-sodium diet and 30 minutes of brisk walking five days a week. Home BP log twice daily.',
      followUp: addDaysToDateStr(today, 60),
      items: [
        ['Telmisartan 40 mg', '1 tablet', 'Once daily, morning', '30 days', 'Take after breakfast'],
        ['Atorvastatin 10 mg', '1 tablet', 'Once daily, night', '30 days', 'Take at bedtime'],
        ['Aspirin 75 mg', '1 tablet', 'Once daily, after lunch', '30 days', 'Report any unusual bleeding'],
      ],
    },
    {
      id: 'f3000000-0000-4000-8000-000000000002',
      number: 'RX-260002',
      appointmentId: 'f0000000-0000-4000-8000-000000000002',
      patientId: PATIENTS[0].patientId,
      doctorId: DOCTORS[1].doctorId,
      diagnosis: 'Contact dermatitis with post-inflammatory hyperpigmentation',
      notes: 'Use a gentle fragrance-free moisturiser twice daily. Avoid direct sun exposure and use SPF 50.',
      followUp: addDaysToDateStr(today, 30),
      items: [
        ['Cetirizine 10 mg', '1 tablet', 'Once daily, night', '7 days', 'May cause drowsiness'],
        ['Mometasone cream 0.1%', 'Thin layer', 'Once daily', '10 days', 'Apply only on affected areas'],
      ],
    },
  ];

  for (const prescription of prescriptions) {
    await query(
      `insert into prescriptions (id, prescription_number, appointment_id, patient_id, doctor_id,
                                  diagnosis, notes, follow_up_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [
        prescription.id,
        prescription.number,
        prescription.appointmentId,
        prescription.patientId,
        prescription.doctorId,
        prescription.diagnosis,
        prescription.notes,
        prescription.followUp,
      ],
    );
    for (const [index, item] of prescription.items.entries()) {
      await query(
        `insert into prescription_items
           (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [prescription.id, item[0], item[1], item[2], item[3], item[4], index],
      );
    }
  }

  const reviews = [
    ['f4000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', PATIENTS[0].patientId, DOCTORS[0].doctorId, 5, 'Dr. Mehta explained my ECG report clearly and adjusted my medication without rushing. The clinic staff were punctual and courteous.'],
    ['f4000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', PATIENTS[0].patientId, DOCTORS[1].doctorId, 5, 'My skin cleared up within three weeks. Dr. Kapoor also helped me simplify my skincare routine.'],
    ['f4000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003', PATIENTS[1].patientId, DOCTORS[4].doctorId, 4, 'Clear diagnosis and a physiotherapy plan that actually worked. Waiting time was a little long.'],
    ['f4000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', PATIENTS[2].patientId, DOCTORS[3].doctorId, 5, 'Dr. Iyer was wonderful with my daughter. Vaccination was quick and stress-free.'],
  ] as const;

  for (const [id, appointmentId, patientId, doctorId, rating, comment] of reviews) {
    await query(
      `insert into reviews (id, appointment_id, patient_id, doctor_id, rating, comment)
       values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
      [id, appointmentId, patientId, doctorId, rating, comment],
    );
  }

  const recordPath = await ensureMedicalRecordFile(PATIENTS[0].patientId);
  await query(
    `insert into medical_records (id, patient_id, appointment_id, file_path, file_name, file_type,
                                  file_size, record_type, uploaded_by)
     values ('f5000000-0000-4000-8000-000000000001', $1, 'f0000000-0000-4000-8000-000000000001',
             $2, 'Complete Blood Count Report.pdf', 'application/pdf', 18432, 'lab_report', $3)
     on conflict (id) do nothing`,
    [PATIENTS[0].patientId, recordPath, PATIENTS[0].profileId],
  );

  await query(
    `insert into complaints (id, profile_id, appointment_id, subject, description, status)
     values ('f6000000-0000-4000-8000-000000000001', $1, 'f0000000-0000-4000-8000-000000000003',
             'Long wait at reception', 'I waited nearly 25 minutes after my appointment time. Would appreciate better queue management.',
             'open')
     on conflict (id) do nothing`,
    [PATIENTS[1].profileId],
  );

  logger.info('Demo seed data created');
  logger.info(
    {
      accounts: {
        admin: 'admin@medibook.in / Admin@12345',
        receptionist: 'reception@medibook.in / Reception@12345',
        doctor: 'arjun.mehta@medibook.in / Doctor@12345',
        patient: 'priya.sharma@example.com / Patient@12345',
      },
    },
    'Demo login credentials',
  );
}
