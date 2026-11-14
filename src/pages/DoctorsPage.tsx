import React, { useState } from 'react';
import { Calendar, Search, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  findNextAvailableSlot,
  getNowInTimezone,
} from '../shared/bookingEngine';
import type { Doctor } from '../shared/types';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
} from '../utils/formatters';

export default function DoctorsPage() {
  const { t } = useTranslation();
  const { language, navigate, clinicState, routeParams } = useApp();
  const isRtl = language.startsWith('ar');

  const [query, setQuery] = useState('');
  const [selectedSpec, setSelectedSpec] = useState(routeParams.specialtyId ?? 'all');
  const [profileDoc, setProfileDoc] = useState<Doctor | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const specialties = clinicState?.specialties ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];
  const exceptions = clinicState?.exceptions ?? [];
  const appointments = clinicState?.appointments ?? [];
  const daysShort = t('common.daysShort', { returnObjects: true }) as string[];
  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  const filtered = doctors.filter((d) => {
    if (!d.active) return false;
    if (selectedSpec !== 'all' && d.specialtyId !== selectedSpec) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const sp = specialties.find((s) => s.id === d.specialtyId);
    return (
      d.nameAr.toLowerCase().includes(q) ||
      d.nameEn.toLowerCase().includes(q) ||
      d.titleAr.toLowerCase().includes(q) ||
      d.titleEn.toLowerCase().includes(q) ||
      (sp?.nameAr.toLowerCase().includes(q) ?? false) ||
      (sp?.nameEn.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-[#14283F] dark:text-white">
          {t('doctors.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('doctors.subtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 inset-inline-start-3.5"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('doctors.searchPlaceholder')}
            aria-label={t('doctors.searchPlaceholder')}
            className="w-full min-h-[44px] ps-10 pe-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#14283F] dark:text-white"
          />
        </div>

        <select
          value={selectedSpec}
          onChange={(e) => setSelectedSpec(e.target.value)}
          aria-label={t('admin.filters.specialty')}
          className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#14283F] dark:text-white"
        >
          <option value="all">{t('doctors.allSpecialties')}</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>
              {isRtl ? s.nameAr : s.nameEn}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-600 dark:text-slate-400">
          {t('reception.noMatches')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((doc) => {
            const sp = specialties.find((s) => s.id === doc.specialtyId);
            const sched = schedules.find((s) => s.doctorId === doc.id);
            const next = sched
              ? findNextAvailableSlot({
                  doctor: doc,
                  schedule: sched,
                  exceptions,
                  appointments,
                  startDateStr: today,
                  timeZone: clinicState?.settings.timezone ?? 'Africa/Cairo',
                })
              : null;

            return (
              <article
                key={doc.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#E6F5F5] dark:bg-teal-950 shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      {!brokenImages[doc.id] ? (
                        <img
                          src={doc.avatarUrl}
                          alt={isRtl ? doc.nameAr : doc.nameEn}
                          width={64}
                          height={64}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => ({ ...prev, [doc.id]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-7 h-7 text-[#087F8C]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-[#087F8C] dark:text-teal-300">
                        {sp ? (isRtl ? sp.nameAr : sp.nameEn) : ''}
                      </p>
                      <h2 className="font-bold text-base text-[#14283F] dark:text-white leading-snug">
                        {isRtl ? doc.nameAr : doc.nameEn}
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {isRtl ? doc.titleAr : doc.titleEn}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {t('doctors.workingDays')}{' '}
                      </span>
                      <span>
                        {sched?.workingDays
                          .map((d) => daysShort[d] ?? '')
                          .join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        {t('doctors.fee')}{' '}
                        <strong className="text-[#14283F] dark:text-white tabular-nums">
                          {formatLocalizedNumber(doc.consultationFeeEgp, language)}{' '}
                          {t('doctors.egp')}
                        </strong>
                      </span>
                      <span
                        className={
                          sched?.bookingsPaused
                            ? 'text-amber-700 dark:text-amber-300 font-semibold'
                            : 'text-[#21A675] font-semibold'
                        }
                      >
                        {sched?.bookingsPaused
                          ? t('doctors.paused')
                          : t('doctors.availableToday')}
                      </span>
                    </div>
                    {next && (
                      <div className="flex items-center gap-1.5 text-[#087F8C] dark:text-teal-300 font-semibold pt-1">
                        <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {t('doctors.nextAvailable')}{' '}
                          {formatLocalizedDate(next.date, language, {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {formatLocalizedTime(next.timeSlot, language)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileDoc(doc)}
                    className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#14283F] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {t('doctors.viewProfile')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate('book', {
                        specialtyId: doc.specialtyId,
                        doctorId: doc.id,
                      })
                    }
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold transition-colors"
                  >
                    {t('doctors.bookNow')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Doctor Profile Modal */}
      {profileDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#087F8C] dark:text-teal-300">
                  {t('doctors.demoNotice')}
                </p>
                <h2
                  id="doc-modal-title"
                  className="text-xl font-bold text-[#14283F] dark:text-white mt-1"
                >
                  {isRtl ? profileDoc.nameAr : profileDoc.nameEn}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {isRtl ? profileDoc.titleAr : profileDoc.titleEn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileDoc(null)}
                aria-label={t('doctors.closeModal')}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {isRtl ? profileDoc.bioAr : profileDoc.bioEn}
            </p>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProfileDoc(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                {t('doctors.closeModal')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = profileDoc;
                  setProfileDoc(null);
                  navigate('book', {
                    specialtyId: d.specialtyId,
                    doctorId: d.id,
                  });
                }}
                className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold"
              >
                {t('doctors.bookNow')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
