import React from 'react';
import { BookOpen, Cpu, Layers, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AboutProjectPage() {
  const { t } = useTranslation();
  const techList = t('about.techList', { returnObjects: true }) as string[];
  const guideSteps = t('about.guideSteps', { returnObjects: true }) as string[];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-[#14283F] dark:text-white">
          {t('about.title')}
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400">
          {t('about.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2">
          <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
            <span>{t('about.problemTitle')}</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('about.problemBody')}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2">
          <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#21A675]" aria-hidden="true" />
            <span>{t('about.solutionTitle')}</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('about.solutionBody')}
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
          <span>{t('about.aiUsageTitle')}</span>
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t('about.aiUsageBody')}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <h2 className="text-lg font-bold text-[#14283F] dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#087F8C]" aria-hidden="true" />
          <span>{t('about.techTitle')}</span>
        </h2>
        <ul className="list-disc ps-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
          {techList.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#087F8C]/30 bg-[#E6F5F5]/50 dark:bg-teal-950/30 dark:border-teal-800 p-6 space-y-3">
        <h2 className="text-lg font-bold text-[#14283F] dark:text-white">
          {t('about.guideTitle')}
        </h2>
        <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {guideSteps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
