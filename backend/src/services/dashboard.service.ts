import { many, one } from '../config/database';
import { AuthUser } from '../types/express';
import { Errors } from '../utils/errors';

export async function getDoctorDashboard(actor: AuthUser) {
  if (!actor.doctorId) throw Errors.forbidden('Doctor profile not found');
  const doctorId = actor.doctorId;

  const stats = await one<{
    today: string;
    upcoming: string;
    completed: string;
    patients: string;
    monthly_earnings: string;
    pending_payment: string;
    completion_rate: string;
    avg_rating: string;
    total_reviews: string;
  }>(
    `select
       count(*) filter (where a.appointment_date = (now() at time zone 'Asia/Kolkata')::date
                         and a.status in ('pending','confirmed','checked_in','in_progress','completed'))::text as today,
       count(*) filter (where a.starts_at > now() and a.status in ('pending','confirmed','checked_in'))::text as upcoming,
       count(*) filter (where a.status = 'completed')::text as completed,
       (select count(distinct patient_id)::text from appointments where doctor_id = $1) as patients,
       (select coalesce(sum(p.amount), 0)::text from payments p join appointments ap on ap.id = p.appointment_id
         where ap.doctor_id = $1 and p.status in ('captured','partially_refunded')
           and date_trunc('month', p.paid_at) = date_trunc('month', now())) as monthly_earnings,
       count(*) filter (where a.payment_status = 'pending' and a.status in ('pending','confirmed'))::text as pending_payment,
       coalesce(round(100.0 * count(*) filter (where a.status = 'completed')
         / nullif(count(*) filter (where a.status in ('completed','cancelled','rejected','no_show')), 0), 0), 0)::text as completion_rate,
       (select average_rating::text from doctors where id = $1) as avg_rating,
       (select total_reviews::text from doctors where id = $1) as total_reviews
     from appointments a where a.doctor_id = $1`,
    [doctorId],
  );

  const todaySchedule = await many<{
    id: string;
    appointment_number: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    appointment_type: string;
    patient_id: string;
    patient_name: string;
    patient_phone: string | null;
    patient_avatar: string | null;
    age: string | null;
    gender: string | null;
    reason: string | null;
    payment_status: string;
    consultation_fee: string;
  }>(
    `select a.id, a.appointment_number, a.starts_at, a.ends_at, a.status, a.appointment_type,
            pt.id as patient_id, pp.full_name as patient_name, pp.phone as patient_phone,
            pp.avatar_url as patient_avatar,
            date_part('year', age(pt.date_of_birth))::text as age, pt.gender,
            a.reason, a.payment_status, a.consultation_fee
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pp on pp.id = pt.profile_id
      where a.doctor_id = $1 and a.appointment_date = (now() at time zone 'Asia/Kolkata')::date
      order by a.starts_at`,
    [doctorId],
  );

  const trend = await many<{ date: string; completed: number; cancelled: number; total: number }>(
    `select to_char(d::date, 'YYYY-MM-DD') as date,
            count(a.id) filter (where a.status = 'completed')::int as completed,
            count(a.id) filter (where a.status in ('cancelled','rejected','no_show'))::int as cancelled,
            count(a.id)::int as total
       from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
       left join appointments a on a.appointment_date = d::date and a.doctor_id = $1
      group by d order by d`,
    [doctorId],
  );

  const earnings = await many<{ month: string; revenue: number }>(
    `select to_char(m, 'YYYY-MM') as month,
            coalesce((
              select sum(p.amount) from payments p
                join appointments a on a.id = p.appointment_id
               where a.doctor_id = $1 and p.status in ('captured','partially_refunded')
                 and date_trunc('month', p.paid_at) = m
            ), 0)::float as revenue
       from generate_series(date_trunc('month', current_date) - interval '5 months',
                            date_trunc('month', current_date), interval '1 month') m
      order by m`,
    [doctorId],
  );

  const recentPatients = await many<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    last_visit: Date;
    visits: number;
  }>(
    `select pt.id, pp.full_name, pp.avatar_url, max(a.starts_at) as last_visit,
            count(a.id) filter (where a.status = 'completed')::int as visits
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pp on pp.id = pt.profile_id
      where a.doctor_id = $1
      group by pt.id, pp.id
      order by max(a.starts_at) desc limit 5`,
    [doctorId],
  );

  return {
    stats: {
      today: Number(stats?.today ?? 0),
      upcoming: Number(stats?.upcoming ?? 0),
      completed: Number(stats?.completed ?? 0),
      totalPatients: Number(stats?.patients ?? 0),
      monthlyEarnings: Number(stats?.monthly_earnings ?? 0),
      pendingPayments: Number(stats?.pending_payment ?? 0),
      completionRate: Number(stats?.completion_rate ?? 0),
      rating: Number(stats?.avg_rating ?? 0),
      totalReviews: Number(stats?.total_reviews ?? 0),
    },
    todaySchedule: todaySchedule.map((row) => ({
      id: row.id,
      appointmentNumber: row.appointment_number,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      appointmentType: row.appointment_type,
      patient: {
        id: row.patient_id,
        name: row.patient_name,
        phone: row.patient_phone,
        avatarUrl: row.patient_avatar,
        age: row.age ? Number(row.age) : null,
        gender: row.gender,
      },
      reason: row.reason,
      paymentStatus: row.payment_status,
      consultationFee: Number(row.consultation_fee),
    })),
    trend,
    earnings,
    recentPatients: recentPatients.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      lastVisit: row.last_visit,
      visits: row.visits,
    })),
  };
}

export async function getAdminDashboard() {
  const stats = await one<Record<string, string>>(
    `select
       (select count(*)::text from patients) as total_patients,
       (select count(*)::text from doctors) as total_doctors,
       (select count(*)::text from doctors where verification_status = 'verified') as verified_doctors,
       (select count(*)::text from doctors where verification_status = 'pending') as pending_doctors,
       (select count(*)::text from appointments) as total_appointments,
       (select count(*)::text from appointments where appointment_date = (now() at time zone 'Asia/Kolkata')::date) as today_appointments,
       (select count(*)::text from appointments where status = 'cancelled') as cancelled_appointments,
       (select count(*)::text from appointments where status = 'pending') as pending_appointments,
       (select count(*)::text from appointments where status = 'completed') as completed_appointments,
       (coalesce((select sum(amount) from payments where status in ('captured','partially_refunded')), 0)
         - coalesce((select sum(amount) from refunds where status = 'processed'), 0))::text as total_revenue,
       (coalesce((select sum(p.amount) from payments p
          where p.status in ('captured','partially_refunded')
            and date_trunc('month', p.paid_at) = date_trunc('month', now())), 0)
         - coalesce((select sum(r.amount) from refunds r
            where r.status = 'processed' and date_trunc('month', r.processed_at) = date_trunc('month', now())), 0))::text as monthly_revenue,
       (select count(*)::text from appointments where date_trunc('month', starts_at) = date_trunc('month', now())) as this_month_appointments,
       (select count(*)::text from appointments where date_trunc('month', starts_at) = date_trunc('month', now() - interval '1 month')) as last_month_appointments
    `,
  );

  const daily = await many<{ date: string; total: number; completed: number; cancelled: number }>(
    `select to_char(d::date, 'YYYY-MM-DD') as date,
            count(a.id)::int as total,
            count(a.id) filter (where a.status = 'completed')::int as completed,
            count(a.id) filter (where a.status in ('cancelled','rejected','no_show'))::int as cancelled
       from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
       left join appointments a on a.appointment_date = d::date
      group by d order by d`,
  );

  const monthlyRevenue = await many<{ month: string; revenue: number; refunds: number }>(
    `select to_char(m, 'YYYY-MM') as month,
            coalesce(sum(p.amount) filter (where p.status in ('captured','partially_refunded')), 0)::float as revenue,
            coalesce((select sum(r.amount) from refunds r where r.status = 'processed'
                       and date_trunc('month', r.processed_at) = m), 0)::float as refunds
       from generate_series(date_trunc('month', current_date) - interval '11 months',
                            date_trunc('month', current_date), interval '1 month') m
       left join payments p on date_trunc('month', p.paid_at) = m
      group by m order by m`,
  );

  const statusDistribution = await many<{ status: string; count: number }>(
    `select status::text as status, count(*)::int as count from appointments group by status order by count desc`,
  );

  const specialtyDistribution = await many<{ specialty: string; count: number }>(
    `select coalesce(s.name, 'General') as specialty, count(a.id)::int as count
       from appointments a
       join doctors d on d.id = a.doctor_id
       left join doctor_specialties ds on ds.doctor_id = d.id and ds.is_primary
       left join specialties s on s.id = ds.specialty_id
      group by s.name order by count desc limit 8`,
  );

  const topDoctors = await many<{
    id: string;
    name: string;
    specialty: string | null;
    completed: number;
    revenue: number;
    rating: string;
  }>(
    `select d.id, dp.full_name as name,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty,
            count(a.id) filter (where a.status = 'completed')::int as completed,
            coalesce(sum(pay.amount) filter (where pay.status in ('captured','partially_refunded')), 0)::float as revenue,
            d.average_rating::text as rating
       from doctors d
       join profiles dp on dp.id = d.profile_id
       left join appointments a on a.doctor_id = d.id
       left join payments pay on pay.appointment_id = a.id
      group by d.id, dp.id
      order by revenue desc, completed desc limit 5`,
  );

  const pendingVerification = await many<{
    id: string;
    full_name: string;
    email: string;
    registration_number: string;
    qualification: string;
    created_at: Date;
    specialty: string | null;
  }>(
    `select d.id, p.full_name, p.email, d.registration_number, d.qualification, d.created_at,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty
       from doctors d join profiles p on p.id = d.profile_id
      where d.verification_status = 'pending'
      order by d.created_at asc`,
  );

  const recentAppointments = await many<{
    id: string;
    appointment_number: string;
    starts_at: Date;
    status: string;
    patient_name: string;
    doctor_name: string;
    consultation_fee: string;
  }>(
    `select a.id, a.appointment_number, a.starts_at, a.status, pp.full_name as patient_name,
            dp.full_name as doctor_name, a.consultation_fee
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pp on pp.id = pt.profile_id
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
      order by a.created_at desc limit 8`,
  );

  const thisMonth = Number(stats?.this_month_appointments ?? 0);
  const lastMonth = Number(stats?.last_month_appointments ?? 0);
  const growth = lastMonth === 0 ? (thisMonth > 0 ? 100 : 0) : Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;

  return {
    stats: {
      totalPatients: Number(stats?.total_patients ?? 0),
      totalDoctors: Number(stats?.total_doctors ?? 0),
      verifiedDoctors: Number(stats?.verified_doctors ?? 0),
      pendingDoctors: Number(stats?.pending_doctors ?? 0),
      totalAppointments: Number(stats?.total_appointments ?? 0),
      todayAppointments: Number(stats?.today_appointments ?? 0),
      cancelledAppointments: Number(stats?.cancelled_appointments ?? 0),
      pendingAppointments: Number(stats?.pending_appointments ?? 0),
      completedAppointments: Number(stats?.completed_appointments ?? 0),
      totalRevenue: Number(stats?.total_revenue ?? 0),
      monthlyRevenue: Number(stats?.monthly_revenue ?? 0),
      appointmentGrowth: growth,
    },
    daily,
    monthlyRevenue,
    statusDistribution,
    specialtyDistribution,
    topDoctors: topDoctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      completed: d.completed,
      revenue: d.revenue,
      rating: Number(d.rating),
    })),
    pendingVerification,
    recentAppointments: recentAppointments.map((a) => ({
      id: a.id,
      appointmentNumber: a.appointment_number,
      startsAt: a.starts_at,
      status: a.status,
      patientName: a.patient_name,
      doctorName: a.doctor_name,
      consultationFee: Number(a.consultation_fee),
    })),
  };
}

export async function getReceptionDashboard(actor: AuthUser) {
  const stats = await one<Record<string, string>>(
    `select
       count(*)::text as today_total,
       count(*) filter (where status = 'checked_in')::text as checked_in,
       count(*) filter (where status = 'confirmed')::text as waiting,
       count(*) filter (where status = 'in_progress')::text as in_progress,
       count(*) filter (where status = 'completed')::text as completed,
       count(*) filter (where status in ('cancelled','no_show'))::text as cancelled
     from appointments
     where appointment_date = (now() at time zone 'Asia/Kolkata')::date`,
  );

  const today = await many<{
    id: string;
    appointment_number: string;
    starts_at: Date;
    status: string;
    patient_name: string;
    patient_phone: string | null;
    doctor_name: string;
    clinic_name: string | null;
    payment_status: string;
    consultation_fee: string;
  }>(
    `select a.id, a.appointment_number, a.starts_at, a.status, pp.full_name as patient_name,
            pp.phone as patient_phone, dp.full_name as doctor_name, c.name as clinic_name,
            a.payment_status, a.consultation_fee
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pp on pp.id = pt.profile_id
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
       left join clinics c on c.id = a.clinic_id
      where a.appointment_date = (now() at time zone 'Asia/Kolkata')::date
      order by a.starts_at`,
  );

  return {
    stats: {
      today: Number(stats?.today_total ?? 0),
      checkedIn: Number(stats?.checked_in ?? 0),
      waiting: Number(stats?.waiting ?? 0),
      inProgress: Number(stats?.in_progress ?? 0),
      completed: Number(stats?.completed ?? 0),
      cancelled: Number(stats?.cancelled ?? 0),
    },
    today: today.map((row) => ({
      id: row.id,
      appointmentNumber: row.appointment_number,
      startsAt: row.starts_at,
      status: row.status,
      patientName: row.patient_name,
      patientPhone: row.patient_phone,
      doctorName: row.doctor_name,
      clinicName: row.clinic_name,
      paymentStatus: row.payment_status,
      consultationFee: Number(row.consultation_fee),
    })),
  };
}
