import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  addDaysToDateStr,
  computeDayAvailability,
  getNowInTimezone,
} from '../shared/bookingEngine';
import { SpecialtyIcon } from '../components/SpecialtyIcon';
import { formatLocalizedNumber } from '../utils/formatters';

export default function HomePage() {
  const { t } = useTranslation();
  const { language, navigate, clinicState } = useApp();
  const isRtl = language.startsWith('ar');
  const DirArrow = isRtl ? ArrowLeft : ArrowRight;

  const today = getNowInTimezone(new Date(), 'Africa/Cairo').dateStr;
  const [quickSpec, setQuickSpec] = useState<string>('');
  const [quickDoc, setQuickDoc] = useState<string>('');
  const [quickDate, setQuickDate] = useState<string>(
    clinicState?.scenarioDate ?? addDaysToDateStr(today, 1)
  );
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const specialties = clinicState?.specialties ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];
  const appointments = clinicState?.appointments ?? [];
  const exceptions = clinicState?.exceptions ?? [];

  const filteredDoctors = quickSpec
    ? doctors.filter((d) => d.specialtyId === quickSpec && d.active)
    : doctors.filter((d) => d.active);

  const scenarioDoctor = doctors.find((d) => d.id === clinicState?.scenarioDoctorId);
  const scenarioOcc =
    clinicState?.occupancyByDoctorDate?.[
      `${clinicState.scenarioDoctorId}|${clinicState.scenarioDate}`
    ];
  const scenarioSchedule = schedules.find(
    (s) => s.doctorId === clinicState?.scenarioDoctorId
  );
  const scenarioAvail =
    scenarioOcc ??
    (scenarioDoctor && scenarioSchedule && clinicState
      ? computeDayAvailability({
          doctor: scenarioDoctor,
          schedule: scenarioSchedule,
          exceptions,
          appointments,
          dateStr: clinicState.scenarioDate,
          timeZone: clinicState.settings.timezone,
        })
      : null);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (quickSpec) params.specialtyId = quickSpec;
    if (quickDoc) params.doctorId = quickDoc;
    if (quickDate) params.date = quickDate;
    navigate('book', params);
  };

  return (
    <div className="space-y-16 pb-8">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 lg:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs sm:text-sm font-semibold text-[#087F8C] dark:text-teal-300">
              {t('brand.tagline')}
            </p>
            <h1 className="text-[clamp(2rem,3.6vw,3.15rem)] font-bold leading-[1.22] text-[#14283F] dark:text-white text-balance">
              {t('home.heroHeadline')}
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t('home.heroSupport')}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('book')}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white font-semibold text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{t('home.ctaPrimary')}</span>
                <DirArrow className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigate('specialties')}
                className="min-h-[48px] px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#14283F] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-base transition-colors whitespace-nowrap"
              >
                {t('home.ctaSecondary')}
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[240px] sm:min-h-[320px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-[#14283F] to-[#087F8C] relative">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_clinic_lobby_1794660438263.jpg"
                  alt={
                    language === 'ar-EG'
                      ? 'صالة استقبال مركز كلينيك فلو الطبي الحديث'
                      : 'ClinicFlow modern medical center reception hall'
                  }
                  width={1280}
                  height={720}
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover aspect-[16/10] lg:aspect-auto"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white text-center space-y-3">
                  <CalendarCheck className="w-12 h-12 text-teal-200" aria-hidden="true" />
                  <p className="font-bold text-xl">{t('brand.name')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Appointment Search Bar */}
        <form
          onSubmit={handleQuickSearch}
          aria-label={t('home.quickSearchTitle')}
          className="mt-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="quick-spec"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                {t('home.quickSearchSpecialty')}
              </label>
              <select
                id="quick-spec"
                value={quickSpec}
                onChange={(e) => {
                  setQuickSpec(e.target.value);
                  setQuickDoc('');
                }}
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#14283F] dark:text-white"
              >
                <option value="">{t('doctors.allSpecialties')}</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isRtl ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="quick-doc"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                {t('nav.doctors')}
              </label>
              <select
                id="quick-doc"
                value={quickDoc}
                onChange={(e) => setQuickDoc(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#14283F] dark:text-white"
              >
                <option value="">{t('home.quickSearchDoctor')}</option>
                {filteredDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {isRtl ? d.nameAr : d.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="quick-date"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                {t('home.quickSearchDate')}
              </label>
              <input
                id="quick-date"
                type="date"
                min={today}
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#14283F] dark:text-white tabular-nums"
              />
            </div>

            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-lg bg-[#14283F] hover:bg-[#1d3959] dark:bg-[#087F8C] dark:hover:bg-[#066873] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>{t('home.quickSearchSubmit')}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Graduation Scenario Callout: 19/20 Last Available Appointment */}
      {clinicState && scenarioAvail && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-[#087F8C]/30 bg-[#E6F5F5] dark:bg-teal-950/40 dark:border-teal-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#065F6B] dark:text-teal-300">
                <span>{t('brand.demoBadge')}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {t('common.bookedCountOf', {
                    booked: formatLocalizedNumber(scenarioAvail.bookedCount, language),
                    cap: formatLocalizedNumber(scenarioAvail.dailyCapacity, language),
                  })}
                </span>
              </div>
              <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
                {t('home.scenarioBannerTitle')}
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {t('home.scenarioBannerDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate('book', {
                  specialtyId: scenarioDoctor?.specialtyId ?? 'spec-internal',
                  doctorId: clinicState.scenarioDoctorId,
                  date: clinicState.scenarioDate,
                })
              }
              className="min-h-[48px] px-5 py-3 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
            >
              <span>{t('home.scenarioBannerCta')}</span>
              <DirArrow className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Specialty Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#14283F] dark:text-white">
              {t('home.specialtiesTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('home.specialtiesSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('specialties')}
            className="min-h-[44px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-[#087F8C] dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>{t('home.viewAllSpecialties')}</span>
            <DirArrow className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {specialties.map((sp) => {
            const docCount = doctors.filter(
              (d) => d.specialtyId === sp.id && d.active
            ).length;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => navigate('book', { specialtyId: sp.id })}
                className="text-start rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-[#087F8C] dark:hover:border-teal-500 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-[#E6F5F5] dark:bg-teal-950/70 text-[#087F8C] dark:text-teal-300 flex items-center justify-center">
                    <SpecialtyIcon iconKey={sp.iconKey} className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                    {isRtl ? sp.nameAr : sp.nameEn}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {isRtl ? sp.descriptionAr : sp.descriptionEn}
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#087F8C] dark:text-teal-300 tabular-nums">
                  {t('specialties.doctorsCount', {
                    count: formatLocalizedNumber(docCount, language),
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Three-Step Booking Explanation */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <h2 className="text-2xl font-bold text-[#14283F] dark:text-white">
          {t('home.stepsTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: t('home.step1Title'), desc: t('home.step1Desc'), icon: Users },
            { title: t('home.step2Title'), desc: t('home.step2Desc'), icon: Clock },
            { title: t('home.step3Title'), desc: t('home.step3Desc'), icon: CheckCircle2 },
          ].map((step, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
            >
              <step.icon className="w-6 h-6 text-[#087F8C] dark:text-teal-400" aria-hidden="true" />
              <h3 className="font-bold text-lg text-[#14283F] dark:text-white">
                {step.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features & AI Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6">
          <h2 className="text-2xl font-bold text-[#14283F] dark:text-white">
            {t('home.benefitsTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                {t('home.benefit1Title')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('home.benefit1Desc')}
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                {t('home.benefit2Title')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('home.benefit2Desc')}
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                {t('home.benefit3Title')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('home.benefit3Desc')}
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                {t('home.benefit4Title')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('home.benefit4Desc')}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#14283F] text-white p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-teal-300" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold leading-snug">
              {t('home.aiShowcaseTitle')}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {t('home.aiShowcaseDesc')}
            </p>
          </div>
          <div className="space-y-4">
            <div className="pt-4 border-t border-white/10 flex items-start gap-2.5 text-xs text-slate-300">
              <ShieldCheck className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{t('home.accessibilityDesc')}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('assistant')}
              className="w-full min-h-[48px] px-5 rounded-xl bg-[#087F8C] hover:bg-[#0a95a4] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{t('home.aiShowcaseCta')}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
