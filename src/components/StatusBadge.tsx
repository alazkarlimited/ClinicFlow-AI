import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppointmentStatus, WaitlistStatus } from '../shared/types';

type AnyStatus = AppointmentStatus | WaitlistStatus;

export function StatusBadge({ status }: { status: AnyStatus }) {
  const { t } = useTranslation();

  const config: Record<
    AnyStatus,
    { classes: string; icon: React.ReactNode; label: string }
  > = {
    confirmed: {
      classes:
        'bg-[#E6F5F5] text-[#065F6B] border-[#087F8C]/30 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-700/50',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.confirmed'),
    },
    checked_in: {
      classes:
        'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700/50',
      icon: <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.checked_in'),
    },
    completed: {
      classes:
        'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700/50',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.completed'),
    },
    cancelled: {
      classes:
        'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      icon: <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.cancelled'),
    },
    no_show: {
      classes:
        'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-700/50',
      icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.no_show'),
    },
    waiting: {
      classes:
        'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/50',
      icon: <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.waiting'),
    },
    offered: {
      classes:
        'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700/50',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.offered'),
    },
    expired: {
      classes:
        'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      icon: <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      label: t('statuses.expired'),
    },
  };

  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold whitespace-nowrap ${c.classes}`}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
}
