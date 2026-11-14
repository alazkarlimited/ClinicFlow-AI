import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Printer,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  addDaysToDateStr,
  computeDayAvailability,
  getNowInTimezone,
} from '../shared/bookingEngine';
import type { Appointment, DayAvailability } from '../shared/types';
import { SpecialtyIcon } from '../components/SpecialtyIcon';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
} from '../utils/formatters';

interface PatientFormValues {
  patientName: string;
  patientPhone: string;
  notes?: string;
}

export default function BookingWizardPage() {
  const { t } = useTranslation();
  const {
    language,
    clinicState,
    routeParams,
    activeRole,
    setShowAuthModal,
    apiFetch,
    refreshState,
    toast,
    navigate,
  } = useApp();
  const isRtl = language.startsWith('ar');

  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  const [step, setStep] = useState<number>(() => {
    if (routeParams.doctorId && routeParams.date) return 4;
    if (routeParams.doctorId) return 3;
    if (routeParams.specialtyId) return 2;
    return 1;
  });

  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>(
    routeParams.specialtyId ?? ''
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    routeParams.doctorId ?? ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    routeParams.date ?? clinicState?.scenarioDate ?? addDaysToDateStr(today, 1)
  );
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [liveDayAvail, setLiveDayAvail] = useState<DayAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedApt, setConfirmedApt] = useState<Appointment | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const schema = z.object({
    patientName: z.string().trim().min(2, t('booking.validation.nameRequired')),
    patientPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\-\s]{8,20}$/, t('booking.validation.phoneInvalid')),
    notes: z.string().max(400).optional(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    reset,
  } = useForm<PatientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientName: clinicState?.patientProfile?.fullName ?? '',
      patientPhone: clinicState?.patientProfile?.phone ?? '',
      notes: '',
    },
  });

  useEffect(() => {
    if (clinicState?.patientProfile && !getValues('patientName')) {
      reset({
        patientName: clinicState.patientProfile.fullName,
        patientPhone: clinicState.patientProfile.phone,
        notes: '',
      });
    }
  }, [clinicState?.patientProfile, getValues, reset]);

  const specialties = clinicState?.specialties ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];

  const doctorsForSpec = selectedSpecialtyId
    ? doctors.filter((d) => d.specialtyId === selectedSpecialtyId && d.active)
    : doctors.filter((d) => d.active);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);
  const selectedSpecialty = specialties.find(
    (s) => s.id === (selectedDoctor?.specialtyId ?? selectedSpecialtyId)
  );

  useEffect(() => {
    if (!selectedDoctorId || !selectedDate) return;
    let active = true;
    setLoadingSlots(true);
    apiFetch<DayAvailability>(
      `/api/clinic/availability?doctorId=${encodeURIComponent(selectedDoctorId)}&date=${encodeURIComponent(selectedDate)}`
    )
      .then((res) => {
        if (active) {
          setLiveDayAvail(res);
          setSelectedSlot((prev) =>
            res.slots.some((s) => s.timeSlot === prev && s.available) ? prev : ''
          );
        }
      })
      .catch(() => {
        if (active) setLiveDayAvail(null);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDoctorId, selectedDate, apiFetch, clinicState?.appointments.length]);

  const dateCandidates = Array.from({ length: 14 }, (_, i) =>
    addDaysToDateStr(today, i)
  );

  const onConfirmBooking = async (values: PatientFormValues) => {
    if (activeRole === 'guest') {
      setShowAuthModal(true);
      return;
    }
    if (!selectedDoctorId || !selectedDate || !selectedSlot) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<{ appointment: Appointment }>('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          date: selectedDate,
          timeSlot: selectedSlot,
          patientName: values.patientName,
          patientPhone: values.patientPhone,
          notes: values.notes,
        }),
      });
      setConfirmedApt(res.appointment);
      setStep(6);
      toast('success', `${t('booking.successTitle')} (${res.appointment.bookingRef})`);
      await refreshState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.errorGeneric');
      toast('error', msg);
      // Re-fetch live availability immediately so UI reflects real capacity
      const fresh = await apiFetch<DayAvailability>(
        `/api/clinic/availability?doctorId=${encodeURIComponent(selectedDoctorId)}&date=${encodeURIComponent(selectedDate)}`
      ).catch(() => null);
      if (fresh) setLiveDayAvail(fresh);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (activeRole === 'guest') {
      setShowAuthModal(true);
      return;
    }
    const vals = getValues();
    const fallbackName = vals.patientName || clinicState?.patientProfile?.fullName || '';
    const fallbackPhone = vals.patientPhone || clinicState?.patientProfile?.phone || '';

    if (fallbackName.trim().length < 2 || fallbackPhone.trim().length < 8) {
      toast('error', t('booking.validation.phoneInvalid'));
      setStep(5);
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          date: selectedDate,
          patientName: fallbackName,
          patientPhone: fallbackPhone,
        }),
      });
      setWaitlistJoined(true);
      toast('success', t('booking.waitlistSuccessTitle'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = [
    t('booking.step1'),
    t('booking.step2'),
    t('booking.step3'),
    t('booking.step4'),
    t('booking.step5'),
    t('booking.step6'),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <div className="no-print space-y-2">
        <h1 className="text-3xl font-bold text-[#14283F] dark:text-white">
          {t('booking.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('booking.subtitle')}
        </p>
      </div>

      {/* Stepper */}
      <nav
        aria-label="Booking steps"
        className="no-print grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2"
      >
        {stepLabels.map((label, idx) => {
          const sNum = idx + 1;
          const isCurrent = step === sNum;
          const isDone = step > sNum;
          const canJump = sNum < step && step < 6;
          return (
            <button
              key={sNum}
              type="button"
              disabled={!canJump}
              onClick={() => canJump && setStep(sNum)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold text-start transition-colors ${
                isCurrent
                  ? 'bg-[#087F8C] text-white border-[#087F8C]'
                  : isDone
                    ? 'bg-[#E6F5F5] dark:bg-teal-950/60 text-[#065F6B] dark:text-teal-200 border-[#087F8C]/30'
                    : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Step 1: Choose Specialty */}
      {step === 1 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
            {t('booking.selectSpecialtyPrompt')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {specialties.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  setSelectedSpecialtyId(sp.id);
                  setSelectedDoctorId('');
                  setStep(2);
                }}
                className={`text-start rounded-2xl border p-5 transition-colors flex items-start gap-3.5 ${
                  selectedSpecialtyId === sp.id
                    ? 'border-[#087F8C] bg-[#E6F5F5]/60 dark:bg-teal-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#087F8C]'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-[#E6F5F5] dark:bg-teal-950 text-[#087F8C] dark:text-teal-300 flex items-center justify-center shrink-0">
                  <SpecialtyIcon iconKey={sp.iconKey} className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-base text-[#14283F] dark:text-white">
                    {isRtl ? sp.nameAr : sp.nameEn}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {isRtl ? sp.descriptionAr : sp.descriptionEn}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: Choose Doctor */}
      {step === 2 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
              {t('booking.selectDoctorPrompt')}
            </h2>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold"
            >
              {t('booking.backBtn')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doctorsForSpec.map((doc) => {
              const sched = schedules.find((s) => s.doctorId === doc.id);
              const occ = clinicState?.occupancyByDoctorDate?.[`${doc.id}|${selectedDate}`];
              const previewAvail =
                occ ??
                (sched && clinicState
                  ? computeDayAvailability({
                      doctor: doc,
                      schedule: sched,
                      exceptions: clinicState.exceptions,
                      appointments: clinicState.appointments,
                      dateStr: selectedDate,
                      timeZone: clinicState.settings.timezone,
                    })
                  : null);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setSelectedDoctorId(doc.id);
                    setSelectedSpecialtyId(doc.specialtyId);
                    setWaitlistJoined(false);
                    setStep(3);
                  }}
                  className="text-start rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-[#087F8C] transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-base text-[#14283F] dark:text-white">
                        {isRtl ? doc.nameAr : doc.nameEn}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {isRtl ? doc.titleAr : doc.titleEn}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#087F8C] dark:text-teal-300 tabular-nums shrink-0">
                      {formatLocalizedNumber(doc.consultationFeeEgp, language)}{' '}
                      {t('doctors.egp')}
                    </span>
                  </div>
                  {previewAvail && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {formatLocalizedDate(selectedDate, language, {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      ·{' '}
                      {t('common.bookedCountOf', {
                        booked: formatLocalizedNumber(previewAvail.bookedCount, language),
                        cap: formatLocalizedNumber(previewAvail.dailyCapacity, language),
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Choose Date */}
      {step === 3 && selectedDoctor && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
              {t('booking.selectDatePrompt')}
            </h2>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold"
            >
              {t('booking.backBtn')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {dateCandidates.map((dStr) => {
              const sched = schedules.find((s) => s.doctorId === selectedDoctor.id);
              const occ =
                clinicState?.occupancyByDoctorDate?.[`${selectedDoctor.id}|${dStr}`];
              const avail =
                occ ??
                (sched && clinicState
                  ? computeDayAvailability({
                      doctor: selectedDoctor,
                      schedule: sched,
                      exceptions: clinicState.exceptions,
                      appointments: clinicState.appointments,
                      dateStr: dStr,
                      timeZone: clinicState.settings.timezone,
                    })
                  : null);
              const isSelected = selectedDate === dStr;
              const closed = avail
                ? 'isClosed' in avail && 'isWorkingDay' in avail
                  ? avail.isClosed || !avail.isWorkingDay
                  : avail.isClosed
                : false;
              const full = avail ? !closed && avail.remainingCapacity === 0 : false;

              return (
                <button
                  key={dStr}
                  type="button"
                  disabled={closed}
                  onClick={() => {
                    setSelectedDate(dStr);
                    setWaitlistJoined(false);
                    setStep(4);
                  }}
                  className={`min-h-[84px] p-3 rounded-xl border text-start flex flex-col justify-between transition-colors ${
                    closed
                      ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                      : isSelected
                        ? 'border-[#087F8C] bg-[#E6F5F5] dark:bg-teal-950/60 text-[#14283F] dark:text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-[#087F8C]'
                  }`}
                >
                  <span className="text-xs font-bold">
                    {formatLocalizedDate(dStr, language, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums">
                    {closed
                      ? language === 'ar-EG'
                        ? 'مغلق'
                        : 'Closed'
                      : full
                        ? language === 'ar-EG'
                          ? `مكتمل (${avail?.bookedCount}/${avail?.dailyCapacity})`
                          : `Full (${avail?.bookedCount}/${avail?.dailyCapacity})`
                        : `${formatLocalizedNumber(avail?.bookedCount ?? 0, language)}/${formatLocalizedNumber(avail?.dailyCapacity ?? 0, language)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 4: Choose Available Time Slot (or Waitlist) */}
      {step === 4 && selectedDoctor && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
                {t('booking.selectSlotPrompt')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {isRtl ? selectedDoctor.nameAr : selectedDoctor.nameEn} ·{' '}
                {formatLocalizedDate(selectedDate, language)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold"
            >
              {t('booking.backBtn')}
            </button>
          </div>

          {loadingSlots ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : liveDayAvail ? (
            <div className="space-y-6">
              {/* Occupancy Indicator Bar */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-[#14283F] dark:text-white">
                    {t('booking.occupancyLabel')}
                  </span>
                  <span className="font-bold tabular-nums text-[#087F8C] dark:text-teal-300">
                    {t('common.bookedCountOf', {
                      booked: formatLocalizedNumber(liveDayAvail.bookedCount, language),
                      cap: formatLocalizedNumber(liveDayAvail.dailyCapacity, language),
                    })}{' '}
                    ({t('booking.remainingLabel')}{' '}
                    {formatLocalizedNumber(liveDayAvail.remainingCapacity, language)}{' '}
                    {t('booking.appointmentsUnit')})
                  </span>
                </div>
                <div
                  className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={liveDayAvail.bookedCount}
                  aria-valuemin={0}
                  aria-valuemax={liveDayAvail.dailyCapacity}
                >
                  <div
                    className={`h-full transition-all ${
                      liveDayAvail.remainingCapacity === 0
                        ? 'bg-[#DC5960]'
                        : liveDayAvail.remainingCapacity <= 2
                          ? 'bg-[#E9A23B]'
                          : 'bg-[#087F8C]'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (liveDayAvail.bookedCount /
                            Math.max(1, liveDayAvail.dailyCapacity)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {liveDayAvail.isClosed ||
              !liveDayAvail.isWorkingDay ||
              liveDayAvail.bookingsPaused ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-6 text-amber-900 dark:text-amber-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-semibold">{t('booking.closedDateMsg')}</p>
                    {(liveDayAvail.closureReasonAr || liveDayAvail.closureReasonEn) && (
                      <p className="text-sm">
                        {isRtl
                          ? liveDayAvail.closureReasonAr
                          : liveDayAvail.closureReasonEn}
                      </p>
                    )}
                  </div>
                </div>
              ) : liveDayAvail.remainingCapacity === 0 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Users className="w-6 h-6 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="font-bold text-base text-[#14283F] dark:text-white">
                        {t('booking.fullWaitlistMsg')}
                      </p>
                      {waitlistJoined && (
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-semibold">
                          {t('booking.waitlistSuccessBody')}
                        </p>
                      )}
                    </div>
                  </div>
                  {!waitlistJoined ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleJoinWaitlist}
                      className="min-h-[48px] px-5 rounded-xl bg-[#14283F] hover:bg-[#1e3a5a] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                      {t('booking.joinWaitlistBtn')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('patient')}
                      className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold"
                    >
                      {t('booking.goToPortalBtn')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {liveDayAvail.slots.map((slot) => {
                    const isPicked = selectedSlot === slot.timeSlot;
                    return (
                      <button
                        key={slot.timeSlot}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => {
                          setSelectedSlot(slot.timeSlot);
                          setStep(5);
                        }}
                        className={`min-h-[56px] px-3 py-2.5 rounded-xl border text-center transition-colors flex flex-col items-center justify-center gap-0.5 ${
                          !slot.available
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                            : isPicked
                              ? 'bg-[#087F8C] text-white border-[#087F8C]'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-[#087F8C] text-[#14283F] dark:text-white'
                        }`}
                      >
                        <span className="text-sm font-bold tabular-nums">
                          {formatLocalizedTime(slot.timeSlot, language)}
                        </span>
                        {!slot.available && (
                          <span className="text-[11px]">
                            {slot.reason === 'past'
                              ? t('booking.pastSlotNote')
                              : t('booking.bookedSlotNote')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}

      {/* Step 5: Patient Details & Review */}
      {step === 5 && selectedDoctor && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmit(onConfirmBooking)}
            noValidate
            className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#14283F] dark:text-white">
                {t('booking.step5')}
              </h2>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold"
              >
                {t('booking.backBtn')}
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="patient-name"
                className="block text-sm font-semibold text-[#14283F] dark:text-slate-200"
              >
                {t('booking.patientNameLabel')}
              </label>
              <input
                id="patient-name"
                type="text"
                autoComplete="name"
                placeholder={t('booking.patientNamePlaceholder')}
                aria-invalid={Boolean(errors.patientName)}
                aria-describedby={errors.patientName ? 'name-err' : undefined}
                {...register('patientName')}
                className="w-full min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-base text-[#14283F] dark:text-white"
              />
              {errors.patientName && (
                <p id="name-err" role="alert" className="text-xs font-semibold text-[#DC5960]">
                  {errors.patientName.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="patient-phone"
                className="block text-sm font-semibold text-[#14283F] dark:text-slate-200"
              >
                {t('booking.patientPhoneLabel')}
              </label>
              <input
                id="patient-phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder={t('booking.patientPhonePlaceholder')}
                aria-invalid={Boolean(errors.patientPhone)}
                aria-describedby={errors.patientPhone ? 'phone-err' : undefined}
                {...register('patientPhone')}
                className="w-full min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-base text-[#14283F] dark:text-white font-mono-code"
              />
              {errors.patientPhone && (
                <p id="phone-err" role="alert" className="text-xs font-semibold text-[#DC5960]">
                  {errors.patientPhone.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="booking-notes"
                className="block text-sm font-semibold text-[#14283F] dark:text-slate-200"
              >
                {t('booking.notesLabel')}
              </label>
              <textarea
                id="booking-notes"
                rows={2}
                placeholder={t('booking.notesPlaceholder')}
                {...register('notes')}
                className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#14283F] dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[50px] px-6 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white font-bold text-base transition-colors disabled:opacity-60"
            >
              {submitting ? t('common.loading') : t('booking.confirmBookingBtn')}
            </button>
          </form>

          <aside className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#14283F] dark:text-white">
              {t('booking.reviewTitle')}
            </h3>
            <dl className="space-y-3 text-sm border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('booking.step1')}</dt>
                <dd className="font-semibold text-[#14283F] dark:text-white">
                  {selectedSpecialty
                    ? isRtl
                      ? selectedSpecialty.nameAr
                      : selectedSpecialty.nameEn
                    : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('booking.step2')}</dt>
                <dd className="font-semibold text-[#14283F] dark:text-white">
                  {isRtl ? selectedDoctor.nameAr : selectedDoctor.nameEn}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('booking.step3')}</dt>
                <dd className="font-semibold text-[#14283F] dark:text-white tabular-nums">
                  {formatLocalizedDate(selectedDate, language)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('booking.step4')}</dt>
                <dd className="font-bold text-[#087F8C] dark:text-teal-300 tabular-nums">
                  {selectedSlot ? formatLocalizedTime(selectedSlot, language) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">{t('doctors.fee')}</dt>
                <dd className="font-bold text-[#14283F] dark:text-white tabular-nums">
                  {formatLocalizedNumber(selectedDoctor.consultationFeeEgp, language)}{' '}
                  {t('doctors.egp')}
                </dd>
              </div>
            </dl>
          </aside>
        </section>
      )}

      {/* Step 6: Confirmed Receipt */}
      {step === 6 && confirmedApt && (
        <section className="print-card rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-[#21A675] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-[#14283F] dark:text-white">
                {t('booking.successTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('booking.checkinInstructions')}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#F6F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">{t('booking.bookingRefLabel')}</div>
              <div
                dir="ltr"
                className="font-mono-code text-lg font-bold text-[#087F8C] dark:text-teal-300 mt-0.5"
              >
                {confirmedApt.bookingRef}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('booking.step2')}</div>
              <div className="font-semibold text-[#14283F] dark:text-white mt-0.5">
                {isRtl
                  ? confirmedApt.doctorNameSnapshotAr
                  : confirmedApt.doctorNameSnapshotEn}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('booking.step1')}</div>
              <div className="font-semibold text-[#14283F] dark:text-white mt-0.5">
                {isRtl
                  ? confirmedApt.specialtyNameSnapshotAr
                  : confirmedApt.specialtyNameSnapshotEn}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('booking.step3')}</div>
              <div className="font-semibold text-[#14283F] dark:text-white mt-0.5 tabular-nums">
                {formatLocalizedDate(confirmedApt.date, language)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('booking.step4')}</div>
              <div className="font-semibold text-[#14283F] dark:text-white mt-0.5 tabular-nums">
                {formatLocalizedTime(confirmedApt.timeSlot, language)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('reception.tableStatus')}</div>
              <div className="mt-1">
                <StatusBadge status={confirmedApt.status} />
              </div>
            </div>
          </div>

          <div className="no-print flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>{t('booking.printBtn')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('patient')}
              className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white font-semibold text-sm inline-flex items-center gap-2"
            >
              <CalendarCheck className="w-4 h-4" aria-hidden="true" />
              <span>{t('booking.goToPortalBtn')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedApt(null);
                setSelectedSlot('');
                setStep(1);
              }}
              className="min-h-[44px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center gap-2"
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span>{t('booking.bookAnotherBtn')}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
