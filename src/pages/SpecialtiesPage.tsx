import React from 'react';
import { ArrowLeft, ArrowRight, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  findNextAvailableSlot,
  getNowInTimezone,
} from '../shared/bookingEngine';
import { SpecialtyIcon } from '../components/SpecialtyIcon';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
} from '../utils/formatters';

export default function SpecialtiesPage() {
  const { t } = useTranslation();
  const { language, navigate, clinicState, loadingState } = useApp();
  const isRtl = language.startsWith('ar');
  const DirArrow = isRtl ? ArrowLeft : ArrowRight;

  if (loadingState && !clinicState) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="h-8 w-56 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-52 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const specialties = clinicState?.specialties ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];
  const exceptions = clinicState?.exceptions ?? [];
  const appointments = clinicState?.appointments ?? [];
  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-[#14283F] dark:text-white">
          {t('specialties.title')}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          {t('specialties.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {specialties.map((sp) => {
          const spDocs = doctors.filter(
            (d) => d.specialtyId === sp.id && d.active
          );

          let earliest: { date: string; timeSlot: string } | null = null;
          for (const doc of spDocs) {
            const sched = schedules.find((s) => s.doctorId === doc.id);
            if (!sched) continue;
            const next = findNextAvailableSlot({
              doctor: doc,
              schedule: sched,
              exceptions,
              appointments,
              startDateStr: today,
              timeZone: clinicState?.settings.timezone ?? 'Africa/Cairo',
            });
            if (
              next &&
              (!earliest ||
                `${next.date} ${next.timeSlot}` <
                  `${earliest.date} ${earliest.timeSlot}`)
            ) {
              earliest = next;
            }
          }

          return (
            <article
              key={sp.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#E6F5F5] dark:bg-teal-950/70 text-[#087F8C] dark:text-teal-300 flex items-center justify-center">
                    <SpecialtyIcon iconKey={sp.iconKey} className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    {t('specialties.doctorsCount', {
                      count: formatLocalizedNumber(spDocs.length, language),
                    })}
                  </span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
                    {isRtl ? sp.nameAr : sp.nameEn}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {isRtl ? sp.descriptionAr : sp.descriptionEn}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Calendar className="w-4 h-4 text-[#087F8C] shrink-0" aria-hidden="true" />
                  {earliest ? (
                    <span>
                      {t('specialties.nextSlot')}{' '}
                      <strong className="tabular-nums">
                        {formatLocalizedDate(earliest.date, language, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        · {formatLocalizedTime(earliest.timeSlot, language)}
                      </strong>
                    </span>
                  ) : (
                    <span>{t('specialties.noSlotsSoon')}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('book', { specialtyId: sp.id })}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>{t('specialties.bookSpecialty')}</span>
                  <DirArrow className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('doctors', { specialtyId: sp.id })}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-[#14283F] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t('specialties.viewDoctors')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
