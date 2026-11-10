import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors';

export interface EligibleProviderMatch {
  providerType: 'DOCTOR' | 'HOSPITAL';
  providerId: string;
  displayName: string;
  city: string;
  stateProvince: string;
  countryCode: string;
  specializationMatched: boolean;
  locationScore: number;
  matchScore: number;
  hasActiveSubscription: boolean;
  remainingQuota: number;
  alreadyAssigned: boolean;
}

export async function findEligibleProvidersForLead(
  leadId: string,
  filters: { q?: string; specialization?: string; city?: string } = {},
  db: PrismaClient = prisma,
): Promise<EligibleProviderMatch[]> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      assignments: {
        where: { status: { in: ['PENDING', 'ACCEPTED'] } },
        select: { doctorId: true, hospitalId: true },
      },
    },
  });

  if (!lead) {
    throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
  }

  const targetSpec = (filters.specialization?.trim() || lead.specialization).toUpperCase();
  const targetCity = (filters.city?.trim() || lead.locationCity).toLowerCase();
  const qLower = filters.q?.trim().toLowerCase() ?? '';
  const now = new Date();

  const assignedDoctors = new Set(
    lead.assignments.map((a) => a.doctorId).filter((v): v is string => Boolean(v)),
  );
  const assignedHospitals = new Set(
    lead.assignments.map((a) => a.hospitalId).filter((v): v is string => Boolean(v)),
  );

  const [doctors, hospitals] = await Promise.all([
    db.doctor.findMany({
      where: {
        archivedAt: null,
        verificationStatus: 'VERIFIED',
        isAcceptingLeads: true,
        countryCode: lead.countryCode,
      },
      include: {
        user: { select: { fullName: true, accountStatus: true } },
        specializations: { select: { specializationCode: true, isPrimary: true } },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
        },
      },
    }),
    db.hospital.findMany({
      where: {
        archivedAt: null,
        verificationStatus: 'VERIFIED',
        isAcceptingLeads: true,
        countryCode: lead.countryCode,
      },
      include: {
        user: { select: { accountStatus: true } },
        departments: {
          where: { isActive: true, isAcceptingLeads: true },
          select: { specializationCode: true },
        },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
        },
      },
    }),
  ]);

  const matches: EligibleProviderMatch[] = [];

  for (const doc of doctors) {
    if (doc.user.accountStatus !== 'ACTIVE') continue;
    if (qLower && !doc.user.fullName.toLowerCase().includes(qLower) && !doc.city.toLowerCase().includes(qLower)) {
      continue;
    }

    const specMatch = doc.specializations.find((s) => s.specializationCode === targetSpec);
    const sameCity = doc.city.toLowerCase() === targetCity;
    const sameState = doc.stateProvince.toLowerCase() === lead.locationState.toLowerCase();
    const locationScore = sameCity ? 30 : sameState ? 20 : 10;
    const specScore = specMatch ? (specMatch.isPrimary ? 50 : 40) : 0;

    const sub = doc.subscriptions[0];
    const remainingQuota = sub ? Math.max(0, sub.leadsAllocatedInPeriod - sub.leadsConsumedInPeriod) : 0;
    const hasActiveSubscription = Boolean(sub && remainingQuota > 0);
    const matchScore = Math.min(100, specScore + locationScore + (hasActiveSubscription ? 20 : 0));

    matches.push({
      providerType: 'DOCTOR',
      providerId: doc.id,
      displayName: doc.user.fullName,
      city: doc.city,
      stateProvince: doc.stateProvince,
      countryCode: doc.countryCode,
      specializationMatched: Boolean(specMatch),
      locationScore,
      matchScore,
      hasActiveSubscription,
      remainingQuota,
      alreadyAssigned: assignedDoctors.has(doc.id),
    });
  }

  for (const hosp of hospitals) {
    if (hosp.user.accountStatus !== 'ACTIVE') continue;
    if (qLower && !hosp.displayName.toLowerCase().includes(qLower) && !hosp.city.toLowerCase().includes(qLower)) {
      continue;
    }

    const specMatch = hosp.departments.some((d) => d.specializationCode === targetSpec);
    const sameCity = hosp.city.toLowerCase() === targetCity;
    const sameState = hosp.stateProvince.toLowerCase() === lead.locationState.toLowerCase();
    const locationScore = sameCity ? 30 : sameState ? 20 : 10;
    const specScore = specMatch ? 45 : 0;

    const sub = hosp.subscriptions[0];
    const remainingQuota = sub ? Math.max(0, sub.leadsAllocatedInPeriod - sub.leadsConsumedInPeriod) : 0;
    const hasActiveSubscription = Boolean(sub && remainingQuota > 0);
    const matchScore = Math.min(100, specScore + locationScore + (hasActiveSubscription ? 20 : 0));

    matches.push({
      providerType: 'HOSPITAL',
      providerId: hosp.id,
      displayName: hosp.displayName,
      city: hosp.city,
      stateProvince: hosp.stateProvince,
      countryCode: hosp.countryCode,
      specializationMatched: specMatch,
      locationScore,
      matchScore,
      hasActiveSubscription,
      remainingQuota,
      alreadyAssigned: assignedHospitals.has(hosp.id),
    });
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore);
}
