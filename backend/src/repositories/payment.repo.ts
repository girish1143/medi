import { many, one } from '../config/database';

export interface PaymentRow {
  id: string;
  appointment_id: string;
  patient_id: string;
  amount: string;
  currency: string;
  payment_provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  status: string;
  paid_at: Date | null;
  created_at: Date;
  appointment_number?: string;
  patient_name?: string;
  doctor_name?: string;
  starts_at?: Date;
  appointment_status?: string;
  appointment_payment_status?: string;
}

export async function findPaymentByAppointment(appointmentId: string): Promise<PaymentRow | null> {
  return one<PaymentRow>(
    `select * from payments where appointment_id = $1 order by created_at desc limit 1`,
    [appointmentId],
  );
}

export async function findPaymentByOrderId(orderId: string): Promise<PaymentRow | null> {
  return one<PaymentRow>(`select * from payments where provider_order_id = $1`, [orderId]);
}

export async function findPaymentById(id: string): Promise<PaymentRow | null> {
  return one<PaymentRow>(`select * from payments where id = $1`, [id]);
}

export interface PaymentFilters {
  status?: string;
  provider?: string;
  search?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function listPayments(filters: PaymentFilters) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`pay.status = $${values.length}`);
  }
  if (filters.provider) {
    values.push(filters.provider);
    clauses.push(`pay.payment_provider = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    clauses.push(`pay.created_at >= $${values.length}::timestamptz`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`pay.created_at <= $${values.length}::timestamptz`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const idx = values.length;
    clauses.push(
      `(a.appointment_number ilike $${idx} or p.full_name ilike $${idx} or pay.provider_payment_id ilike $${idx})`,
    );
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  const countRow = await one<{ count: string }>(
    `select count(*)::text as count from payments pay
       join appointments a on a.id = pay.appointment_id
       join patients pt on pt.id = pay.patient_id
       join profiles p on p.id = pt.profile_id
       ${where}`,
    values,
  );

  values.push(filters.limit, filters.offset);
  const rows = await many<PaymentRow>(
    `select pay.*, a.appointment_number, a.starts_at, a.status as appointment_status,
            a.payment_status as appointment_payment_status,
            p.full_name as patient_name, dp.full_name as doctor_name
       from payments pay
       join appointments a on a.id = pay.appointment_id
       join patients pt on pt.id = pay.patient_id
       join profiles p on p.id = pt.profile_id
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
       ${where}
      order by pay.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function listRefunds(limit: number, offset: number) {
  const rows = await many<{
    id: string;
    amount: string;
    reason: string;
    status: string;
    provider_refund_id: string | null;
    created_at: Date;
    processed_at: Date | null;
    appointment_number: string;
    patient_name: string;
  }>(
    `select r.id, r.amount, r.reason, r.status, r.provider_refund_id, r.created_at, r.processed_at,
            a.appointment_number, p.full_name as patient_name
       from refunds r
       join appointments a on a.id = r.appointment_id
       join payments pay on pay.id = r.payment_id
       join patients pt on pt.id = pay.patient_id
       join profiles p on p.id = pt.profile_id
      order by r.created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  const totalRow = await one<{ count: string }>('select count(*)::text as count from refunds');
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function refundedAmount(paymentId: string): Promise<number> {
  const row = await one<{ total: string | null }>(
    `select coalesce(sum(amount), 0)::text as total from refunds
      where payment_id = $1 and status in ('requested','approved','processed')`,
    [paymentId],
  );
  return Number(row?.total ?? 0);
}
