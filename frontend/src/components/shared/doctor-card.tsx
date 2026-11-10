import Link from 'next/link';
import { BadgeCheck, CalendarCheck2, Clock3, MapPin, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RatingStars } from '@/components/shared/rating-stars';
import { formatCurrency, formatDayLabel, formatTime, initials } from '@/lib/utils';
import type { DoctorSummary } from '@/types';

export function DoctorCard({ doctor }: { doctor: DoctorSummary }) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-soft">
      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14 rounded-2xl">
          {doctor.avatarUrl ? <AvatarImage src={doctor.avatarUrl} alt={doctor.fullName} /> : null}
          <AvatarFallback className="rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 text-base text-blue-700">
            {initials(doctor.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold text-slate-900">{doctor.fullName}</h3>
              <p className="mt-0.5 truncate text-xs text-slate-500">{doctor.qualification}</p>
            </div>
            <Badge variant="success" className="shrink-0 gap-1 px-2 py-0.5">
              <BadgeCheck className="h-3 w-3" /> Verified
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="font-medium text-blue-600">{doctor.primarySpecialty ?? doctor.specialties[0] ?? 'General physician'}</span>
            <span className="text-slate-300">•</span>
            <span>{doctor.experienceYears} yrs exp</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RatingStars rating={doctor.rating} count={doctor.totalReviews} />
        {doctor.clinic && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            {doctor.clinic.name}
            {doctor.clinic.city ? `, ${doctor.clinic.city}` : ''}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {doctor.specialties.slice(0, 3).map((specialty) => (
          <span key={specialty} className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
            {specialty}
          </span>
        ))}
        {doctor.onlineConsultationFee !== null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-100">
            <Video className="h-3 w-3" /> Video
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm font-bold text-slate-900">{formatCurrency(doctor.consultationFee)}</p>
          <p className="text-[11px] text-slate-500">In-clinic consultation</p>
        </div>
        <div className="text-right">
          {doctor.nextAvailableAt ? (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Clock3 className="h-3.5 w-3.5" />
              {formatDayLabel(doctor.nextAvailableAt)}, {formatTime(doctor.nextAvailableAt)}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1 text-xs text-slate-400">
              <CalendarCheck2 className="h-3.5 w-3.5" /> Check availability
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/doctors/${doctor.id}`}>View profile</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/book/${doctor.id}`}>Book now</Link>
        </Button>
      </div>
    </article>
  );
}
