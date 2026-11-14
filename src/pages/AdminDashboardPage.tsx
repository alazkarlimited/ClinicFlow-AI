import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Bot,
  CalendarCog,
  Download,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  computeAnalyticsSummary,
  getNowInTimezone,
} from '../shared/bookingEngine';
import type {
  AiBiReport,
  AppointmentStatus,
  Doctor,
  DoctorSchedule,
} from '../shared/types';
import {
  formatLocalizedDateTime,
  formatLocalizedNumber,
} from '../utils/formatters';

type AdminTab = 'analytics' | 'doctors' | 'aiBi' | 'settings';

export default function AdminDashboardPage() {
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

  const [tab, setTab] = useState<AdminTab>('analytics');
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [docFilter, setDocFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>(
    'all'
  );

  // Doctor & Schedule Management State
  const [editingDoctorId, setEditingDoctorId] = useState<string>('doc-internal-1');
  const [docForm, setDocForm] = useState<{
    nameAr: string;
    nameEn: string;
    specialtyId: string;
    fee: number;
    startTime: string;
    endTime: string;
    breakStart: string;
    breakEnd: string;
    slotDurationMinutes: number;
    dailyCapacity: number;
    workingDays: number[];
    bookingsPaused: boolean;
  } | null>(null);

  const [excDocId, setExcDocId] = useState('doc-internal-1');
  const [excDate, setExcDate] = useState('');
  const [excReason, setExcReason] = useState('');

  // AI BI State
  const [biQuestion, setBiQuestion] = useState('');
  const [biReport, setBiReport] = useState<AiBiReport | null>(null);
  const [biError, setBiError] = useState<string | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  // Settings & Staff State
  const [cutoffHours, setCutoffHours] = useState<number>(
    clinicState?.settings.cancellationCutoffHours ?? 4
  );
  const [offerExpiry, setOfferExpiry] = useState<number>(
    clinicState?.settings.waitlistOfferExpirationMinutes ?? 30
  );
  const [defaultLimit, setDefaultLimit] = useState<number>(
    clinicState?.settings.defaultDailyLimit ?? 20
  );
  const [clinicNameAr, setClinicNameAr] = useState<string>(
    clinicState?.settings.clinicNameAr ?? 'مركز كلينيك فلو الطبي التخصصي'
  );
  const [clinicNameEn, setClinicNameEn] = useState<string>(
    clinicState?.settings.clinicNameEn ?? 'ClinicFlow Medical Center'
  );
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<'receptionist' | 'admin'>(
    'receptionist'
  );
  const [saving, setSaving] = useState(false);

  const today = getNowInTimezone(
    new Date(),
    clinicState?.settings.timezone ?? 'Africa/Cairo'
  ).dateStr;

  const filteredAnalytics = useMemo(() => {
    if (!clinicState) return null;
    return computeAnalyticsSummary({
      specialties: clinicState.specialties,
      doctors: clinicState.doctors,
      schedules: clinicState.schedules,
      appointments: clinicState.appointments,
      waitlist: clinicState.waitlist,
      settings: clinicState.settings,
      todayDateStr: today,
      filters: {
        specialtyId: specFilter,
        doctorId: docFilter,
        status: statusFilter,
      },
    });
  }, [clinicState, today, specFilter, docFilter, statusFilter]);

  if (activeRole !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 mx-auto text-amber-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-[#14283F] dark:text-white">
          {language === 'ar-EG'
            ? 'هذه اللوحة مخصصة لمدير النظام فقط'
            : 'Administrator privileges required'}
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

  const specialties = clinicState?.specialties ?? [];
  const doctors = clinicState?.doctors ?? [];
  const schedules = clinicState?.schedules ?? [];
  const daysShort = t('common.daysShort', { returnObjects: true }) as string[];

  const loadDoctorIntoEditor = (id: string) => {
    setEditingDoctorId(id);
    const d = doctors.find((x) => x.id === id);
    const s = schedules.find((x) => x.doctorId === id);
    if (d && s) {
      setDocForm({
        nameAr: d.nameAr,
        nameEn: d.nameEn,
        specialtyId: d.specialtyId,
        fee: d.consultationFeeEgp,
        startTime: s.startTime,
        endTime: s.endTime,
        breakStart: s.breakStart ?? '',
        breakEnd: s.breakEnd ?? '',
        slotDurationMinutes: s.slotDurationMinutes,
        dailyCapacity: s.dailyCapacity,
        workingDays: [...s.workingDays],
        bookingsPaused: s.bookingsPaused,
      });
    }
  };

  const activeDocForm =
    docForm ??
    (() => {
      const d = doctors.find((x) => x.id === editingDoctorId) ?? doctors[0];
      const s = schedules.find((x) => x.doctorId === d?.id) ?? schedules[0];
      if (!d || !s) return null;
      return {
        nameAr: d.nameAr,
        nameEn: d.nameEn,
        specialtyId: d.specialtyId,
        fee: d.consultationFeeEgp,
        startTime: s.startTime,
        endTime: s.endTime,
        breakStart: s.breakStart ?? '',
        breakEnd: s.breakEnd ?? '',
        slotDurationMinutes: s.slotDurationMinutes,
        dailyCapacity: s.dailyCapacity,
        workingDays: [...s.workingDays],
        bookingsPaused: s.bookingsPaused,
      };
    })();

  const handleSaveDoctorSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDocForm) return;
    const origDoc = doctors.find((d) => d.id === editingDoctorId);
    const origSched = schedules.find((s) => s.doctorId === editingDoctorId);
    if (!origDoc || !origSched) return;

    const updatedDoc: Doctor = {
      ...origDoc,
      nameAr: activeDocForm.nameAr,
      nameEn: activeDocForm.nameEn,
      specialtyId: activeDocForm.specialtyId,
      consultationFeeEgp: Number(activeDocForm.fee),
    };
    const updatedSched: DoctorSchedule = {
      ...origSched,
      workingDays: activeDocForm.workingDays,
      startTime: activeDocForm.startTime,
      endTime: activeDocForm.endTime,
      breakStart: activeDocForm.breakStart || undefined,
      breakEnd: activeDocForm.breakEnd || undefined,
      slotDurationMinutes: Number(activeDocForm.slotDurationMinutes),
      dailyCapacity: Number(activeDocForm.dailyCapacity),
      bookingsPaused: activeDocForm.bookingsPaused,
    };

    setSaving(true);
    try {
      await apiFetch('/api/admin/doctors', {
        method: 'POST',
        body: JSON.stringify({ doctor: updatedDoc, schedule: updatedSched }),
      });
      toast('success', t('admin.doctorsMgmt.saveDoctor'));
      setDocForm(null);
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excDate) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/exceptions', {
        method: 'POST',
        body: JSON.stringify({
          id: `exc-${excDocId}-${excDate}`,
          doctorId: excDocId,
          date: excDate,
          isClosed: true,
          reasonAr: excReason || 'إغلاق إداري',
          reasonEn: excReason || 'Administrative closure',
        }),
      });
      toast('success', t('admin.doctorsMgmt.saveException'));
      setExcDate('');
      setExcReason('');
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleRunBi = async (promptText: string) => {
    const q = promptText.trim();
    if (!q) return;
    setBiQuestion(q);
    setBiLoading(true);
    setBiError(null);
    try {
      const res = await apiFetch<{
        report: AiBiReport | null;
        aiAvailable: boolean;
        errorMessage?: string;
      }>('/api/ai/bi', {
        method: 'POST',
        body: JSON.stringify({ question: q, language }),
      });
      if (res.report) {
        setBiReport(res.report);
      } else {
        setBiError(res.errorMessage ?? t('common.errorGeneric'));
      }
    } catch (err) {
      setBiError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBiLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          clinicNameAr,
          clinicNameEn,
          cancellationCutoffHours: Number(cutoffHours),
          defaultDailyLimit: Number(defaultLimit),
          waitlistOfferExpirationMinutes: Number(offerExpiry),
        }),
      });
      toast('success', t('admin.settings.saveSettings'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          email: staffEmail,
          displayName: staffName,
          role: staffRole,
        }),
      });
      toast('success', t('admin.settings.assignStaff'));
      setStaffEmail('');
      setStaffName('');
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDemo = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/demo/reset', { method: 'POST' });
      toast('success', t('admin.settings.resetDemoBtn'));
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!clinicState) return;
    const rows = [
      ['BookingRef', 'Date', 'Time', 'Specialty', 'Doctor', 'Status', 'Type'],
      ...clinicState.appointments.map((a) => [
        a.bookingRef,
        a.date,
        a.timeSlot,
        a.specialtyNameSnapshotEn,
        a.doctorNameSnapshotEn,
        a.status,
        a.bookingType,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clinicflow-report-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navTabs: Array<{ id: AdminTab; label: string; icon: React.ElementType }> = [
    { id: 'analytics', label: t('admin.tabs.analytics'), icon: Activity },
    { id: 'doctors', label: t('admin.tabs.doctors'), icon: CalendarCog },
    { id: 'aiBi', label: t('admin.tabs.aiBi'), icon: Bot },
    { id: 'settings', label: t('admin.tabs.settings'), icon: Settings },
  ];

  const biPresets = t('admin.aiBi.presets', { returnObjects: true }) as string[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#14283F] dark:text-white">
            {t('admin.title')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t('admin.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-[#087F8C]" aria-hidden="true" />
          <span>{t('admin.filters.exportCsv')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Sidebar / Mobile Tabs */}
        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex lg:flex-col gap-1 overflow-x-auto">
          {navTabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#087F8C] text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Panel */}
        <div className="lg:col-span-9 space-y-6 min-w-0">
          {/* TAB 1: ANALYTICS */}
          {tab === 'analytics' && filteredAnalytics && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={specFilter}
                  onChange={(e) => setSpecFilter(e.target.value)}
                  aria-label={t('admin.filters.specialty')}
                  className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="all">{t('admin.filters.specialty')}: {t('admin.filters.all')}</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {isRtl ? s.nameAr : s.nameEn}
                    </option>
                  ))}
                </select>

                <select
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  aria-label={t('admin.filters.doctor')}
                  className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="all">{t('admin.filters.doctor')}: {t('admin.filters.all')}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {isRtl ? d.nameAr : d.nameEn}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as AppointmentStatus | 'all')
                  }
                  aria-label={t('admin.filters.status')}
                  className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="all">{t('admin.filters.status')}: {t('admin.filters.all')}</option>
                  <option value="confirmed">{t('statuses.confirmed')}</option>
                  <option value="checked_in">{t('statuses.checked_in')}</option>
                  <option value="completed">{t('statuses.completed')}</option>
                  <option value="cancelled">{t('statuses.cancelled')}</option>
                  <option value="no_show">{t('statuses.no_show')}</option>
                </select>
              </div>

              {/* 9 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: t('admin.kpis.total'), val: filteredAnalytics.totalAppointments },
                  { label: t('admin.kpis.today'), val: filteredAnalytics.todayAppointments },
                  { label: t('admin.kpis.capacity'), val: filteredAnalytics.totalAvailableCapacity },
                  { label: t('admin.kpis.utilization'), val: `${filteredAnalytics.utilizationRate}%` },
                  { label: t('admin.kpis.completed'), val: filteredAnalytics.completedCount },
                  { label: t('admin.kpis.cancelled'), val: filteredAnalytics.cancelledCount },
                  { label: t('admin.kpis.noShowRate'), val: `${filteredAnalytics.noShowRate}%` },
                  { label: t('admin.kpis.waitlist'), val: filteredAnalytics.waitlistCount },
                  { label: t('admin.kpis.activeDoctors'), val: filteredAnalytics.activeDoctorsCount },
                ].map((k, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1"
                  >
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {k.label}
                    </div>
                    <div className="text-2xl font-bold text-[#14283F] dark:text-white tabular-nums">
                      {typeof k.val === 'number'
                        ? formatLocalizedNumber(k.val, language)
                        : k.val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <h2 className="text-base font-bold text-[#14283F] dark:text-white">
                    {t('admin.charts.dailyTrends')}
                  </h2>
                  <div className="h-72 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredAnalytics.dailyTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name={t('admin.charts.totalSeries')}
                          stroke="#087F8C"
                          fill="#087F8C"
                          fillOpacity={0.2}
                        />
                        <Area
                          type="monotone"
                          dataKey="completed"
                          name={t('admin.charts.completedSeries')}
                          stroke="#21A675"
                          fill="#21A675"
                          fillOpacity={0.15}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <h2 className="text-base font-bold text-[#14283F] dark:text-white">
                    {t('admin.charts.bySpecialty')}
                  </h2>
                  <div className="h-72 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={filteredAnalytics.bySpecialty.map((s) => ({
                          name: isRtl ? s.nameAr : s.nameEn,
                          total: s.total,
                          utilizationRate: s.utilizationRate,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar
                          dataKey="total"
                          name={t('admin.charts.totalSeries')}
                          fill="#14283F"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <h2 className="text-base font-bold text-[#14283F] dark:text-white">
                    {t('admin.charts.peakHours')}
                  </h2>
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredAnalytics.peakHours}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                        <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          name={t('admin.charts.totalSeries')}
                          fill="#087F8C"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <h2 className="text-base font-bold text-[#14283F] dark:text-white">
                    {t('admin.charts.doctorUtil')}
                  </h2>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pe-2">
                    {filteredAnalytics.byDoctor.map((d) => (
                      <div key={d.doctorId} className="space-y-1 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-[#14283F] dark:text-slate-200 truncate">
                            {isRtl ? d.nameAr : d.nameEn}
                          </span>
                          <span className="tabular-nums font-bold text-[#087F8C]">
                            {d.utilizationRate}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-[#087F8C]"
                            style={{ width: `${d.utilizationRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOCTORS & SCHEDULES */}
          {tab === 'doctors' && activeDocForm && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200">
                {t('admin.doctorsMgmt.conflictWarning')}
              </div>

              <form
                onSubmit={handleSaveDoctorSchedule}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
                    {t('admin.doctorsMgmt.editDoctor')}
                  </h2>
                  <select
                    value={editingDoctorId}
                    onChange={(e) => loadDoctorIntoEditor(e.target.value)}
                    aria-label={t('admin.filters.doctor')}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {isRtl ? d.nameAr : d.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.nameAr')}
                    </label>
                    <input
                      type="text"
                      value={activeDocForm.nameAr}
                      onChange={(e) =>
                        setDocForm({ ...activeDocForm, nameAr: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.nameEn')}
                    </label>
                    <input
                      type="text"
                      value={activeDocForm.nameEn}
                      onChange={(e) =>
                        setDocForm({ ...activeDocForm, nameEn: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.dailyCapacity')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={activeDocForm.dailyCapacity}
                      onChange={(e) =>
                        setDocForm({
                          ...activeDocForm,
                          dailyCapacity: Number(e.target.value),
                        })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.slotDuration')}
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={activeDocForm.slotDurationMinutes}
                      onChange={(e) =>
                        setDocForm({
                          ...activeDocForm,
                          slotDurationMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.startTime')}
                    </label>
                    <input
                      type="time"
                      value={activeDocForm.startTime}
                      onChange={(e) =>
                        setDocForm({ ...activeDocForm, startTime: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.doctorsMgmt.endTime')}
                    </label>
                    <input
                      type="time"
                      value={activeDocForm.endTime}
                      onChange={(e) =>
                        setDocForm({ ...activeDocForm, endTime: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold block">
                    {t('admin.doctorsMgmt.workingDays')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {daysShort.map((dName, dow) => {
                      const active = activeDocForm.workingDays.includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? activeDocForm.workingDays.filter((x) => x !== dow)
                              : [...activeDocForm.workingDays, dow].sort();
                            setDocForm({ ...activeDocForm, workingDays: next });
                          }}
                          className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold ${
                            active
                              ? 'bg-[#087F8C] text-white border-[#087F8C]'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {dName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeDocForm.bookingsPaused}
                    onChange={(e) =>
                      setDocForm({
                        ...activeDocForm,
                        bookingsPaused: e.target.checked,
                      })
                    }
                    className="w-5 h-5 rounded accent-[#087F8C]"
                  />
                  <span>{t('admin.doctorsMgmt.pauseBookings')}</span>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold"
                >
                  {t('admin.doctorsMgmt.saveDoctor')}
                </button>
              </form>

              {/* Schedule Exception Form */}
              <form
                onSubmit={handleSaveException}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
                  {t('admin.doctorsMgmt.addException')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={excDocId}
                    onChange={(e) => setExcDocId(e.target.value)}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {isRtl ? d.nameAr : d.nameEn}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    min={today}
                    required
                    value={excDate}
                    onChange={(e) => setExcDate(e.target.value)}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                  <input
                    type="text"
                    value={excReason}
                    onChange={(e) => setExcReason(e.target.value)}
                    placeholder={t('admin.doctorsMgmt.exceptionReason')}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#14283F] text-white text-sm font-semibold"
                >
                  {t('admin.doctorsMgmt.saveException')}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: AI BUSINESS INTELLIGENCE */}
          {tab === 'aiBi' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-[#14283F] dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
                    <span>{t('admin.aiBi.title')}</span>
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t('admin.aiBi.subtitle')}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {biPresets.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={biLoading}
                      onClick={() => handleRunBi(p)}
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#087F8C] text-xs font-semibold text-[#14283F] dark:text-slate-200"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunBi(biQuestion);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={biQuestion}
                    onChange={(e) => setBiQuestion(e.target.value)}
                    placeholder={t('admin.aiBi.customPlaceholder')}
                    className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={biLoading || !biQuestion.trim()}
                    className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {biLoading ? t('common.loading') : t('admin.aiBi.analyzeBtn')}
                  </button>
                </form>
              </div>

              {biError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-5 text-sm text-amber-900 dark:text-amber-200">
                  {biError}
                </div>
              )}

              {biReport && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
                  <div className="text-xs font-semibold text-[#087F8C] dark:text-teal-300">
                    {t('admin.aiBi.periodLabel')} {biReport.reportingPeriod}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-base text-[#14283F] dark:text-white">
                      {t('admin.aiBi.summaryTitle')}
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {biReport.executiveSummary}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="font-bold text-sm text-[#14283F] dark:text-white">
                        {t('admin.aiBi.findingsTitle')}
                      </h3>
                      <ul className="list-disc ps-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                        {biReport.importantFindings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-sm text-[#14283F] dark:text-white">
                        {t('admin.aiBi.bottlenecksTitle')}
                      </h3>
                      <ul className="list-disc ps-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                        {biReport.bottlenecks.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-bold text-sm text-[#14283F] dark:text-white">
                      {t('admin.aiBi.recommendationsTitle')}
                    </h3>
                    <div className="space-y-3">
                      {biReport.recommendations.map((rec, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1"
                        >
                          <div className="font-bold text-sm text-[#14283F] dark:text-white">
                            {rec.title}
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {rec.action}
                          </p>
                          <p className="text-xs text-[#087F8C] dark:text-teal-300 font-semibold">
                            {t('admin.aiBi.evidenceLabel')} {rec.evidence}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {biReport.disclaimer}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS, STAFF & AUDIT LOG */}
          {tab === 'settings' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveSettings}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
                  {t('admin.settings.clinicIdentityTitle')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.settings.clinicNameAr')}
                    </label>
                    <input
                      type="text"
                      value={clinicNameAr}
                      onChange={(e) => setClinicNameAr(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.settings.clinicNameEn')}
                    </label>
                    <input
                      type="text"
                      value={clinicNameEn}
                      onChange={(e) => setClinicNameEn(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.settings.cutoffHours')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={72}
                      value={cutoffHours}
                      onChange={(e) => setCutoffHours(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.settings.offerExpiry')}
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={offerExpiry}
                      onChange={(e) => setOfferExpiry(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      {t('admin.settings.defaultLimit')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={defaultLimit}
                      onChange={(e) => setDefaultLimit(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold"
                >
                  {t('admin.settings.saveSettings')}
                </button>
              </form>

              {/* Staff Role Management */}
              <form
                onSubmit={handleAssignStaff}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
                  {t('admin.settings.staffTitle')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="email"
                    required
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder={t('admin.settings.staffEmail')}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder={t('admin.settings.staffName')}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                  <select
                    value={staffRole}
                    onChange={(e) =>
                      setStaffRole(e.target.value as 'receptionist' | 'admin')
                    }
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    <option value="receptionist">{t('auth.roleReceptionist')}</option>
                    <option value="admin">{t('auth.roleAdmin')}</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#14283F] text-white text-sm font-semibold"
                >
                  {t('admin.settings.assignStaff')}
                </button>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-2 text-xs">
                  {clinicState?.staffAccounts.map((st) => (
                    <div
                      key={st.uid}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-[#14283F] dark:text-white">
                          {st.displayName}
                        </span>{' '}
                        <span className="text-slate-500">({st.email})</span>
                      </div>
                      <span className="font-bold text-[#087F8C] uppercase">
                        {st.role}
                      </span>
                    </div>
                  ))}
                </div>
              </form>

              {/* Demo Reset */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-[#14283F] dark:text-white">
                    {t('admin.settings.resetDemoTitle')}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t('admin.settings.resetDemoDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleResetDemo}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center gap-2 shrink-0 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span>{t('admin.settings.resetDemoBtn')}</span>
                </button>
              </div>

              {/* Audit Logs */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
                  {t('admin.settings.auditTitle')}
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto text-xs">
                  {clinicState?.auditLogs.slice(0, 40).map((log) => (
                    <div key={log.id} className="py-2.5 space-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#14283F] dark:text-white">
                          {isRtl ? log.summaryAr : log.summaryEn}
                        </span>
                        <span className="text-slate-500 tabular-nums">
                          {formatLocalizedDateTime(log.createdAt, language)}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        {log.action} · {log.actorRole} ({log.actorUid})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
