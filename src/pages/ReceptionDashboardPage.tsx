import React, { useState } from 'react';
import {
  PlusCircle,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  computeDayAvailability,
  getNowInTimezone,
} from '../shared/bookingEngine';
import type { AppointmentStatus, BookingType } from '../shared/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
} from '../utils/formatters';

export default function ReceptionDashboardPage() {
  const { t } = useTranslation();
  const {
    language,
    activeRole,
    clinicState,
    apiFetch,
    refreshState,
    toast,
    setShowAuthModal,
  } = useApp();
  const isRtl = language.startsWith('ar');

  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(today);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Walk-in form state
  const [wDocId, setWDocId] = useState('doc-internal-1');
  const [wDate, setWDate] = useState(today);
  const [wSlot, setWSlot] = useState('');
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wType, setWType] = useState<BookingType>('walk_in');

  if (activeRole !== 'receptionist' && activeRole !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 mx-auto text-amber-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-[#14283F] dark:text-white">
          {language === 'ar-EG'
            ? 'هذه الشاشة مخصصة لموظفي الاستقبال والإدارة'
            : 'Reception or Administrator access required'}
        </h1>
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold"
        >
          {t('auth.signIn')}
        </button>
      </div>
    );
  }

  const appointments = clinicState?.appointments ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];
  const exceptions = clinicState?.exceptions ?? [];
  const waitlist = clinicState?.waitlist ?? [];

  const todayApts = appointments.filter((a) => a.date === today);
  const kpiArrived = todayApts.filter((a) => a.status === 'checked_in').length;
  const kpiWaiting = todayApts.filter((a) => a.status === 'confirmed').length;
  const kpiCompleted = todayApts.filter((a) => a.status === 'completed').length;
  const kpiNoShow = todayApts.filter((a) => a.status === 'no_show').length;

  const filteredApts = appointments
    .filter((a) => (!dateFilter ? true : a.date === dateFilter))
    .filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter))
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.bookingRef.toLowerCase().includes(q) ||
        a.patientName.toLowerCase().includes(q) ||
        a.patientPhone.includes(q) ||
        a.doctorNameSnapshotAr.toLowerCase().includes(q) ||
        a.doctorNameSnapshotEn.toLowerCase().includes(q)
      );
    })
    .slice(0, 60);

  const handleStatusChange = async (
    id: string,
    nextStatus: AppointmentStatus
  ) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      toast('success', t(`statuses.${nextStatus}`));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/appointments/${id}/cancel`, { method: 'POST' });
      toast('success', t('statuses.cancelled'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const handleTriggerOffer = async (entryId: string) => {
    setBusyId(entryId);
    try {
      await apiFetch(`/api/waitlist/${entryId}/offer`, { method: 'POST' });
      toast('success', t('statuses.offered'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const wDoc = doctors.find((d) => d.id === wDocId);
  const wSched = schedules.find((s) => s.doctorId === wDocId);
  const walkInAvail =
    wDoc && wSched
      ? computeDayAvailability({
          doctor: wDoc,
          schedule: wSched,
          exceptions,
          appointments,
          dateStr: wDate,
          timeZone: clinicState?.settings.timezone ?? 'Africa/Cairo',
        })
      : null;

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wSlot || wName.trim().length < 2 || wPhone.trim().length < 8) {
      toast('error', t('booking.validation.phoneInvalid'));
      return;
    }
    setBusyId('walkin');
    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: wDocId,
          date: wDate,
          timeSlot: wSlot,
          patientName: wName,
          patientPhone: wPhone,
          bookingType: wType,
        }),
      });
      toast('success', t('booking.successTitle'));
      setShowWalkInModal(false);
      setWName('');
      setWPhone('');
      setWSlot('');
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#14283F] dark:text-white">
            {t('reception.title')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t('reception.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWalkInModal(true)}
          className="min-h-[48px] px-5 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0"
        >
          <PlusCircle className="w-4 h-4" aria-hidden="true" />
          <span>{t('reception.walkInBtn')}</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: t('reception.kpiToday'), val: todayApts.length },
          { label: t('reception.kpiArrived'), val: kpiArrived },
          { label: t('reception.kpiWaiting'), val: kpiWaiting },
          { label: t('reception.kpiCompleted'), val: kpiCompleted },
          { label: t('reception.kpiNoShow'), val: kpiNoShow },
        ].map((k, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1"
          >
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {k.label}
            </div>
            <div className="text-2xl font-bold text-[#14283F] dark:text-white tabular-nums">
              {formatLocalizedNumber(k.val, language)}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 inset-inline-start-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('reception.searchPlaceholder')}
            aria-label={t('reception.searchPlaceholder')}
            className="w-full min-h-[44px] ps-9 pe-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label={t('booking.step3')}
          className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t('reception.filterStatus')}
          className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
        >
          <option value="all">{t('reception.allStatuses')}</option>
          <option value="confirmed">{t('statuses.confirmed')}</option>
          <option value="checked_in">{t('statuses.checked_in')}</option>
          <option value="completed">{t('statuses.completed')}</option>
          <option value="cancelled">{t('statuses.cancelled')}</option>
          <option value="no_show">{t('statuses.no_show')}</option>
        </select>
      </div>

      {/* Responsive Appointments Table (Desktop) & Card List (Mobile) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredApts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t('reception.noMatches')}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-start text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 text-start">{t('reception.tableRef')}</th>
                    <th className="py-3 px-4 text-start">{t('reception.tablePatient')}</th>
                    <th className="py-3 px-4 text-start">{t('reception.tableDoctor')}</th>
                    <th className="py-3 px-4 text-start">{t('reception.tableTime')}</th>
                    <th className="py-3 px-4 text-start">{t('reception.tableStatus')}</th>
                    <th className="py-3 px-4 text-end">{t('reception.tableActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredApts.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono-code text-xs font-bold text-[#087F8C] dark:text-teal-300" dir="ltr">
                        {apt.bookingRef}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#14283F] dark:text-white">
                          {apt.patientName}
                        </div>
                        <div dir="ltr" className="text-xs text-slate-500 font-mono-code inline-block">
                          {apt.patientPhone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#14283F] dark:text-slate-200">
                          {isRtl ? apt.doctorNameSnapshotAr : apt.doctorNameSnapshotEn}
                        </div>
                        <div className="text-xs text-slate-500">
                          {isRtl ? apt.specialtyNameSnapshotAr : apt.specialtyNameSnapshotEn}
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-xs">
                        <div>{formatLocalizedDate(apt.date, language, { month: 'short', day: 'numeric' })}</div>
                        <div className="font-semibold">{formatLocalizedTime(apt.timeSlot, language)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={apt.status} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {apt.status === 'confirmed' && (
                            <button
                              type="button"
                              disabled={busyId === apt.id}
                              onClick={() => handleStatusChange(apt.id, 'checked_in')}
                              className="min-h-[36px] px-2.5 rounded-lg bg-[#087F8C] text-white text-xs font-semibold"
                            >
                              {t('reception.checkInBtn')}
                            </button>
                          )}
                          {(apt.status === 'confirmed' || apt.status === 'checked_in') && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === apt.id}
                                onClick={() => handleStatusChange(apt.id, 'completed')}
                                className="min-h-[36px] px-2.5 rounded-lg bg-[#21A675] text-white text-xs font-semibold"
                              >
                                {t('reception.completeBtn')}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === apt.id}
                                onClick={() => handleStatusChange(apt.id, 'no_show')}
                                className="min-h-[36px] px-2.5 rounded-lg border border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-semibold"
                              >
                                {t('reception.noShowBtn')}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === apt.id}
                                onClick={() => handleCancel(apt.id)}
                                className="min-h-[36px] px-2.5 rounded-lg border border-red-200 text-red-700 dark:text-red-300 text-xs font-semibold"
                              >
                                {t('reception.cancelBtn')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Alternative (zero horizontal scroll!) */}
            <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredApts.map((apt) => (
                <div key={apt.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="font-mono-code text-xs font-bold text-[#087F8C]">
                      {apt.bookingRef}
                    </span>
                    <StatusBadge status={apt.status} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#14283F] dark:text-white">
                      {apt.patientName}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {isRtl ? apt.doctorNameSnapshotAr : apt.doctorNameSnapshotEn} ·{' '}
                      {formatLocalizedTime(apt.timeSlot, language)}
                    </div>
                  </div>
                  {(apt.status === 'confirmed' || apt.status === 'checked_in') && (
                    <div className="flex flex-wrap gap-2">
                      {apt.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(apt.id, 'checked_in')}
                          className="min-h-[44px] px-3 rounded-lg bg-[#087F8C] text-white text-xs font-semibold"
                        >
                          {t('reception.checkInBtn')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(apt.id, 'completed')}
                        className="min-h-[44px] px-3 rounded-lg bg-[#21A675] text-white text-xs font-semibold"
                      >
                        {t('reception.completeBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(apt.id, 'no_show')}
                        className="min-h-[44px] px-3 rounded-lg border border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-semibold"
                      >
                        {t('reception.noShowBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(apt.id)}
                        className="min-h-[44px] px-3 rounded-lg border border-red-200 text-red-700 dark:text-red-300 text-xs font-semibold"
                      >
                        {t('reception.cancelBtn')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Doctor Capacity Overview + Waitlist Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
            {t('reception.doctorSchedulesTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {doctors
              .filter((d) => d.active)
              .map((doc) => {
                const sched = schedules.find((s) => s.doctorId === doc.id);
                if (!sched) return null;
                const avail = computeDayAvailability({
                  doctor: doc,
                  schedule: sched,
                  exceptions,
                  appointments,
                  dateStr: dateFilter || today,
                  timeZone: clinicState?.settings.timezone ?? 'Africa/Cairo',
                });
                const pct = Math.min(
                  100,
                  Math.round(
                    (avail.bookedCount / Math.max(1, avail.dailyCapacity)) * 100
                  )
                );
                return (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2"
                  >
                    <div className="font-semibold text-xs text-[#14283F] dark:text-white truncate">
                      {isRtl ? doc.nameAr : doc.nameEn}
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      <span>
                        {t('reception.remainingSlots', {
                          rem: formatLocalizedNumber(avail.remainingCapacity, language),
                          cap: formatLocalizedNumber(avail.dailyCapacity, language),
                        })}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#087F8C]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
            {t('reception.waitlistQueueTitle')}
          </h2>
          {waitlist.length === 0 ? (
            <p className="text-sm text-slate-500">{t('patient.noWaitlist')}</p>
          ) : (
            <div className="space-y-3">
              {waitlist.slice(0, 8).map((w) => {
                const doc = doctors.find((d) => d.id === w.doctorId);
                return (
                  <div
                    key={w.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <StatusBadge status={w.status} />
                      <div className="font-semibold text-sm text-[#14283F] dark:text-white truncate">
                        {w.patientName}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {doc ? (isRtl ? doc.nameAr : doc.nameEn) : w.doctorId} ·{' '}
                        {w.date}
                      </div>
                    </div>
                    {w.status === 'waiting' && (
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => handleTriggerOffer(w.id)}
                        className="min-h-[38px] px-3 rounded-lg bg-[#14283F] text-white text-xs font-semibold shrink-0"
                      >
                        {t('reception.sendOfferBtn')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Walk-in / Assisted Booking Modal */}
      {showWalkInModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkin-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="walkin-modal-title"
                className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2"
              >
                <UserCheck className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
                <span>{t('reception.walkInTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                aria-label={t('common.close')}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="w-type" className="block text-xs font-semibold">
                  {t('reception.walkInType')}
                </label>
                <select
                  id="w-type"
                  value={wType}
                  onChange={(e) => setWType(e.target.value as BookingType)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="walk_in">{t('reception.typeWalkIn')}</option>
                  <option value="reception_assisted">{t('reception.typeAssisted')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="w-doc" className="block text-xs font-semibold">
                    {t('booking.step2')}
                  </label>
                  <select
                    id="w-doc"
                    value={wDocId}
                    onChange={(e) => {
                      setWDocId(e.target.value);
                      setWSlot('');
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {isRtl ? d.nameAr : d.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="w-date" className="block text-xs font-semibold">
                    {t('booking.step3')}
                  </label>
                  <input
                    id="w-date"
                    type="date"
                    min={today}
                    value={wDate}
                    onChange={(e) => {
                      setWDate(e.target.value);
                      setWSlot('');
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="w-slot" className="block text-xs font-semibold">
                  {t('booking.step4')} (
                  {walkInAvail
                    ? t('common.bookedCountOf', {
                        booked: walkInAvail.bookedCount,
                        cap: walkInAvail.dailyCapacity,
                      })
                    : ''}
                  )
                </label>
                <select
                  id="w-slot"
                  value={wSlot}
                  onChange={(e) => setWSlot(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="">--</option>
                  {walkInAvail?.slots
                    .filter((s) => s.available)
                    .map((s) => (
                      <option key={s.timeSlot} value={s.timeSlot}>
                        {formatLocalizedTime(s.timeSlot, language)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="w-name" className="block text-xs font-semibold">
                  {t('booking.patientNameLabel')}
                </label>
                <input
                  id="w-name"
                  type="text"
                  required
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="w-phone" className="block text-xs font-semibold">
                  {t('booking.patientPhoneLabel')}
                </label>
                <input
                  id="w-phone"
                  type="tel"
                  dir="ltr"
                  required
                  value={wPhone}
                  onChange={(e) => setWPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono-code"
                />
              </div>

              <button
                type="submit"
                disabled={busyId === 'walkin'}
                className="w-full min-h-[48px] rounded-xl bg-[#087F8C] text-white font-semibold text-sm"
              >
                {t('booking.confirmBookingBtn')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
