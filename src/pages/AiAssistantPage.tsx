import React, { useState } from 'react';
import {
  Bot,
  CalendarCheck,
  CheckCircle2,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import type { AiChatMessage, Appointment } from '../shared/types';
import { formatLocalizedDate, formatLocalizedTime } from '../utils/formatters';

export default function AiAssistantPage() {
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

  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        language === 'ar-EG'
          ? 'أهلًا بك في مساعد كلينيك فلو الذكي! كيف أساعدك اليوم في البحث عن تخصص، معرفة أقرب ميعاد متاح، أو مراجعة سياسات الحجز؟'
          : 'Welcome to ClinicFlow AI Assistant! How can I help you check doctor availability, browse specialties, or review clinic policies today?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const suggestions = t('assistant.suggestions', {
    returnObjects: true,
  }) as string[];

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch<{
        reply: string;
        cards: AiChatMessage['cards'];
        aiAvailable: boolean;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          language,
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          cards: res.cards,
          timestamp: new Date().toISOString(),
          error: !res.aiAvailable,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content:
            err instanceof Error ? err.message : t('common.errorGeneric'),
          timestamp: new Date().toISOString(),
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmSlotFromCard = async (payload: {
    doctorId: string;
    date: string;
    timeSlot: string;
  }) => {
    if (activeRole === 'guest') {
      setShowAuthModal(true);
      toast('info', t('assistant.needAuthForAction'));
      return;
    }

    const key = `${payload.doctorId}-${payload.date}-${payload.timeSlot}`;
    setConfirmingKey(key);
    try {
      const pName =
        clinicState?.patientProfile?.fullName ?? 'محمود عبد الله حسن';
      const pPhone = clinicState?.patientProfile?.phone ?? '01012345601';

      const res = await apiFetch<{ appointment: Appointment }>(
        '/api/appointments',
        {
          method: 'POST',
          body: JSON.stringify({
            doctorId: payload.doctorId,
            date: payload.date,
            timeSlot: payload.timeSlot,
            patientName: pName,
            patientPhone: pPhone,
          }),
        }
      );

      toast(
        'success',
        `${t('booking.successTitle')} (${res.appointment.bookingRef})`
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `rec-${Date.now()}`,
          role: 'assistant',
          content:
            language === 'ar-EG'
              ? `تم تأكيد الحجز بنجاح برقم مرجعي ${res.appointment.bookingRef} ليوم ${res.appointment.date} الساعة ${res.appointment.timeSlot}.`
              : `Confirmed your appointment! Booking Reference: ${res.appointment.bookingRef} on ${res.appointment.date} at ${res.appointment.timeSlot}.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      await refreshState();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setConfirmingKey(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#14283F] text-teal-300 flex items-center justify-center">
            <Bot className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#14283F] dark:text-white">
              {t('assistant.title')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('assistant.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Medical Safety Rule Banner */}
      <div
        role="note"
        className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3 text-xs sm:text-sm text-amber-950 dark:text-amber-200"
      >
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">{t('assistant.safetyBanner')}</p>
      </div>

      {/* Quick Suggestions */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested prompts">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            type="button"
            disabled={sending}
            onClick={() => sendMessage(s)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#087F8C] text-xs font-semibold text-[#14283F] dark:text-slate-200 transition-colors text-start"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat Thread */}
      <div
        aria-live="polite"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-4 min-h-[360px] max-h-[540px] overflow-y-auto"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            } space-y-2`}
          >
            <div
              className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#14283F] text-white'
                  : msg.error
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                    : 'bg-[#F6F9FC] dark:bg-slate-800 text-[#14283F] dark:text-slate-100 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {msg.content}
            </div>

            {msg.cards?.map((card, cIdx) => {
              if (card.type === 'slots') {
                const p = card.payload as {
                  doctorId: string;
                  doctorNameAr: string;
                  doctorNameEn: string;
                  date: string;
                  bookedCount: number;
                  dailyCapacity: number;
                  slots: string[];
                };
                return (
                  <div
                    key={cIdx}
                    className="w-full max-w-lg rounded-xl border border-[#087F8C]/30 bg-[#E6F5F5]/40 dark:bg-teal-950/30 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#065F6B] dark:text-teal-300">
                      <span>{isRtl ? card.titleAr : card.titleEn}</span>
                      <span className="tabular-nums">
                        {formatLocalizedDate(p.date, language, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        ({p.bookedCount}/{p.dailyCapacity})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.slots.map((slot) => {
                        const key = `${p.doctorId}-${p.date}-${slot}`;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={confirmingKey === key}
                            onClick={() =>
                              handleConfirmSlotFromCard({
                                doctorId: p.doctorId,
                                date: p.date,
                                timeSlot: slot,
                              })
                            }
                            className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-[#087F8C] text-xs font-bold text-[#087F8C] dark:text-teal-300 hover:bg-[#087F8C] hover:text-white transition-colors tabular-nums"
                          >
                            {formatLocalizedTime(slot, language)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              if (card.type === 'confirm_booking') {
                const p = card.payload as {
                  doctorId: string;
                  doctorNameAr: string;
                  doctorNameEn: string;
                  date: string;
                  timeSlot: string;
                };
                const key = `${p.doctorId}-${p.date}-${p.timeSlot}`;
                return (
                  <div
                    key={cIdx}
                    className="w-full max-w-md rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                      <CalendarCheck className="w-4 h-4" aria-hidden="true" />
                      <span>{isRtl ? card.titleAr : card.titleEn}</span>
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      {isRtl ? p.doctorNameAr : p.doctorNameEn} ·{' '}
                      {formatLocalizedDate(p.date, language)} ·{' '}
                      {formatLocalizedTime(p.timeSlot, language)}
                    </div>
                    <button
                      type="button"
                      disabled={confirmingKey === key}
                      onClick={() => handleConfirmSlotFromCard(p)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#21A675] hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>{t('assistant.confirmSlotAction')}</span>
                    </button>
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Sparkles className="w-4 h-4 text-[#087F8C] animate-pulse" aria-hidden="true" />
            <span>{t('assistant.sending')}</span>
          </div>
        )}
      </div>

      {/* Message Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('assistant.inputPlaceholder')}
          aria-label={t('assistant.inputPlaceholder')}
          className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#14283F] dark:text-white"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="min-h-[48px] px-5 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>{t('assistant.sendBtn')}</span>
        </button>
      </form>
    </div>
  );
}
