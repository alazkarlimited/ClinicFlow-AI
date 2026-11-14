import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  Bot,
  CalendarPlus,
  Check,
  Clock,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { canCancelAppointment, getNowInTimezone } from '../shared/bookingEngine';
import type { Appointment, LanguageCode } from '../shared/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedTime,
} from '../utils/formatters';

export default function PatientPortalPage() {
  const { t } = useTranslation();
  const {
    language,
    setLanguage,
    elderlyMode,
    toggleElderlyMode,
    activeRole,
    clinicState,
    apiFetch,
    refreshState,
    toast,
    navigate,
    setShowAuthModal,
  } = useApp();
  const isRtl = language.startsWith('ar');

  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [fullName, setFullName] = useState(
    clinicState?.patientProfile?.fullName ?? 'محمود عبد الله حسن'
  );
  const [phone, setPhone] = useState(
    clinicState?.patientProfile?.phone ?? '01012345601'
  );
  const [prefLang, setPrefLang] = useState<LanguageCode>(language);

  if (activeRole === 'guest') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-5">
        <ShieldAlert className="w-12 h-12 mx-auto text-[#087F8C]" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-[#14283F] dark:text-white">
          {t('auth.authRequiredTitle')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('auth.authRequiredBody')}
        </p>
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="min-h-[48px] px-6 rounded-xl bg-[#087F8C] text-white font-semibold text-sm"
        >
          {t('auth.signIn')}
        </button>
      </div>
    );
  }

  const appointments = clinicState?.appointments ?? [];
  const waitlist = clinicState?.waitlist ?? [];
  const notifications = clinicState?.notifications ?? [];
  const doctors = clinicState?.doctors ?? [];
  const cutoffHours = clinicState?.settings.cancellationCutoffHours ?? 4;
  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  const upcoming = appointments.filter(
    (a) =>
      a.date >= today && (a.status === 'confirmed' || a.status === 'checked_in')
  );
  const history = appointments.filter(
    (a) =>
      a.date < today ||
      a.status === 'completed' ||
      a.status === 'cancelled' ||
      a.status === 'no_show'
  );

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await apiFetch(`/api/appointments/${cancelTarget.id}/cancel`, {
        method: 'POST',
      });
      toast('success', `${t('statuses.cancelled')} (${cancelTarget.bookingRef})`);
      setCancelTarget(null);
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmOffer = async (entryId: string) => {
    setBusyId(entryId);
    try {
      await apiFetch(`/api/waitlist/${entryId}/confirm`, { method: 'POST' });
      toast('success', t('booking.successTitle'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId('profile');
    try {
      await apiFetch('/api/patient/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          phone,
          preferredLanguage: prefLang,
          elderlyAssistMode: elderlyMode,
        }),
      });
      setLanguage(prefLang);
      toast('success', t('patient.profileSaved'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(
      () => {}
    );
    await refreshState();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#14283F] dark:text-white">
            {t('patient.greeting', {
              name: clinicState?.patientProfile?.fullName ?? fullName,
            })}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('patient.cutoffWarning', { hours: cutoffHours })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('book')}
            className="min-h-[44px] px-4 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <CalendarPlus className="w-4 h-4" aria-hidden="true" />
            <span>{t('home.ctaPrimary')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('assistant')}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Bot className="w-4 h-4 text-[#087F8C]" aria-hidden="true" />
            <span>{t('nav.assistant')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Upcoming Appointments */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
              {t('patient.upcomingTitle')}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                {t('patient.noUpcoming')}
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((apt) => {
                  const cancelCheck = canCancelAppointment({
                    appointment: apt,
                    actorRole: activeRole,
                    cutoffHours,
                    timeZone: clinicState?.settings.timezone ?? 'Africa/Cairo',
                  });
                  return (
                    <div
                      key={apt.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            dir="ltr"
                            className="font-mono-code text-xs font-bold text-[#087F8C] dark:text-teal-300"
                          >
                            {apt.bookingRef}
                          </span>
                          <StatusBadge status={apt.status} />
                        </div>
                        <div className="font-bold text-base text-[#14283F] dark:text-white">
                          {isRtl
                            ? apt.doctorNameSnapshotAr
                            : apt.doctorNameSnapshotEn}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                          {isRtl
                            ? apt.specialtyNameSnapshotAr
                            : apt.specialtyNameSnapshotEn}{' '}
                          · {formatLocalizedDate(apt.date, language)} ·{' '}
                          {formatLocalizedTime(apt.timeSlot, language)}
                        </div>
                      </div>

                      {cancelCheck.allowed && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(apt)}
                          className="min-h-[44px] px-4 rounded-xl border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold shrink-0"
                        >
                          {t('patient.cancelBtn')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Waitlist & Offers */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
              <span>{t('patient.waitlistTitle')}</span>
            </h2>
            {waitlist.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('patient.noWaitlist')}
              </p>
            ) : (
              <div className="space-y-3">
                {waitlist.map((entry) => {
                  const doc = doctors.find((d) => d.id === entry.doctorId);
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <StatusBadge status={entry.status} />
                        <div className="font-bold text-sm text-[#14283F] dark:text-white mt-1">
                          {doc ? (isRtl ? doc.nameAr : doc.nameEn) : entry.doctorId}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                          {formatLocalizedDate(entry.date, language)}
                          {entry.offeredTimeSlot &&
                            ` · ${formatLocalizedTime(entry.offeredTimeSlot, language)}`}
                        </div>
                        {entry.status === 'offered' && entry.offerExpiresAt && (
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {t('patient.offerExpiresLabel')}{' '}
                            {formatLocalizedDateTime(entry.offerExpiresAt, language)}
                          </p>
                        )}
                      </div>

                      {entry.status === 'offered' && (
                        <button
                          type="button"
                          disabled={busyId === entry.id}
                          onClick={() => handleConfirmOffer(entry.id)}
                          className="min-h-[44px] px-4 rounded-xl bg-[#21A675] hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
                        >
                          {t('patient.confirmOfferBtn')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Appointment History */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
              {t('patient.historyTitle')}
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('patient.noHistory')}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.slice(0, 12).map((apt) => (
                  <div
                    key={apt.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span dir="ltr" className="font-mono-code text-xs text-slate-500 me-2">
                        {apt.bookingRef}
                      </span>
                      <span className="font-semibold text-[#14283F] dark:text-white">
                        {isRtl
                          ? apt.doctorNameSnapshotAr
                          : apt.doctorNameSnapshotEn}
                      </span>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {formatLocalizedDate(apt.date, language)} ·{' '}
                        {formatLocalizedTime(apt.timeSlot, language)}
                      </div>
                    </div>
                    <StatusBadge status={apt.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Notifications + Profile */}
        <div className="lg:col-span-4 space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
              <span>{t('patient.notificationsTitle')}</span>
            </h2>
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('patient.noNotifications')}
              </p>
            ) : (
              <div className="space-y-3">
                {notifications.slice(0, 8).map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3.5 space-y-1.5 text-xs ${
                      n.read
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30'
                        : 'border-[#087F8C]/40 bg-[#E6F5F5]/50 dark:bg-teal-950/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-[#14283F] dark:text-white">
                        {isRtl ? n.titleAr : n.titleEn}
                      </span>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          aria-label={t('patient.markRead')}
                          className="text-[#087F8C] hover:underline shrink-0 inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {isRtl ? n.bodyAr : n.bodyEn}
                    </p>
                    {n.channel !== 'in_app' && (
                      <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        {t('patient.simulatedBadge')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
              <span>{t('patient.profileTitle')}</span>
            </h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="prof-name"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  {t('booking.patientNameLabel')}
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  {t('booking.patientPhoneLabel')}
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono-code"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="prof-lang"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  {isRtl ? 'اللغة المفضلة' : 'Preferred Language'}
                </label>
                <select
                  id="prof-lang"
                  value={prefLang}
                  onChange={(e) => setPrefLang(e.target.value as LanguageCode)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="ar-EG">العربية (مصر)</option>
                  <option value="en">English</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={elderlyMode}
                  onChange={toggleElderlyMode}
                  className="w-5 h-5 rounded accent-[#087F8C]"
                />
                <span>{t('nav.elderlyMode')}</span>
              </label>

              <button
                type="submit"
                disabled={busyId === 'profile'}
                className="w-full min-h-[44px] rounded-xl bg-[#14283F] hover:bg-[#1e3a5a] text-white text-sm font-semibold"
              >
                {t('patient.saveProfileBtn')}
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-[#DC5960] shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <h2
                  id="cancel-dialog-title"
                  className="text-lg font-bold text-[#14283F] dark:text-white"
                >
                  {t('patient.cancelDialogTitle')}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('patient.cancelDialogBody', { ref: cancelTarget.bookingRef })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
              >
                {t('patient.keepAction')}
              </button>
              <button
                type="button"
                disabled={busyId === cancelTarget.id}
                onClick={handleConfirmCancel}
                className="min-h-[44px] px-4 rounded-xl bg-[#DC5960] hover:bg-red-700 text-white text-sm font-semibold"
              >
                {t('patient.confirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
