"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  LayoutTemplate,
  ScanText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { UiControls } from "@/components/ui-controls";
import { Button } from "@/components/ui/button";
import { DecryptText } from "@/components/ui/decrypt-text";
import { GlassCursor } from "@/components/ui/glass-cursor";
import { useUi } from "@/components/providers";

const GlobeLabels = dynamic(
  () => import("@/components/ui/cobe-globe-labels").then((module) => module.GlobeLabels),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="aspect-square w-full max-w-[30rem] animate-pulse rounded-full bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
      />
    ),
  },
);

const ARABIC_GLYPH_POOL =
  "ابتثجحخدذرزسشصضطظعغفقكلمنهوي٠١٢٣٤٥٦٧٨٩";
const LATIN_GLYPH_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const copy = {
  en: {
    navFeatures: "Capabilities",
    navProcess: "Workflow",
    navPricing: "Pricing",
    signIn: "Sign in",
    start: "Start translating",
    titleA: "Professional documents, fluent",
    titleB: "in English and Arabic.",
    intro: "Translate contracts, reports, scans, and camera captures in a focused workspace built for accuracy, layout review, and human approval.",
    trusted: "AI-assisted professional draft",
    privacy: "Private workspace memory",
    noCard: "No card required",
    capabilities: "Every document stays understandable and reviewable",
    capabilitiesIntro: "Structure, terminology, and review context stay visible from the first upload to the final export.",
    steps: "A clear path from source to approval",
    stepsIntro: "Each stage has a defined outcome, so your team always knows what needs attention next.",
    cta: "Translate your first 5,000 words",
    ctaSub: "Free during beta. Your documents remain in your private workspace.",
    waitlist: "Paid plans coming later",
    disclaimer: "Translations are AI-assisted professional drafts and are not legally certified translations.",
  },
  ar: {
    navFeatures: "الإمكانات",
    navProcess: "سير العمل",
    navPricing: "الأسعار",
    signIn: "تسجيل الدخول",
    start: "ابدأ الترجمة",
    titleA: "مستندات احترافية بطلاقة",
    titleB: "بالعربية والإنجليزية.",
    intro: "ترجم العقود والتقارير والمستندات الممسوحة والصور ضمن مساحة عمل تركز على الدقة ومراجعة التنسيق والاعتماد البشري.",
    trusted: "مسودة احترافية بمساعدة الذكاء الاصطناعي",
    privacy: "ذاكرة خاصة لمساحة العمل",
    noCard: "لا حاجة لبطاقة",
    capabilities: "يبقى كل مستند واضحاً وقابلاً للمراجعة",
    capabilitiesIntro: "تظل البنية والمصطلحات وسياق المراجعة واضحة منذ الرفع الأول وحتى التصدير النهائي.",
    steps: "مسار واضح من المصدر إلى الاعتماد",
    stepsIntro: "لكل مرحلة نتيجة محددة، ليعرف فريقك دائماً ما يحتاج إلى الاهتمام تالياً.",
    cta: "ترجم أول ٥٬٠٠٠ كلمة",
    ctaSub: "مجاناً خلال النسخة التجريبية. تبقى مستنداتك في مساحة عملك الخاصة.",
    waitlist: "الخطط المدفوعة ستتوفر لاحقاً",
    disclaimer: "الترجمات مسودات احترافية بمساعدة الذكاء الاصطناعي وليست ترجمات قانونية معتمدة.",
  },
} as const;

const features = [
  { icon: ScanText, en: "Inspect before translation", ar: "افحص قبل الترجمة", detailEn: "Extract text, detect scans, and route uncertain OCR to a focused correction step.", detailAr: "استخرج النص واكتشف الصور الممسوحة ووجّه القراءة غير المؤكدة إلى خطوة تصحيح واضحة." },
  { icon: LayoutTemplate, en: "Layout-aware document view", ar: "عرض يراعي تخطيط المستند", detailEn: "Keep tables, headings, reading order, and page-level warnings visible while you review.", detailAr: "حافظ على الجداول والعناوين وترتيب القراءة وتنبيهات الصفحات أثناء المراجعة." },
  { icon: BookOpenCheck, en: "Glossary & private memory", ar: "قاموس وذاكرة خاصة", detailEn: "Reuse approved terminology inside the same workspace without crossing tenant boundaries.", detailAr: "أعد استخدام المصطلحات المعتمدة داخل مساحة العمل نفسها دون تجاوز حدود الخصوصية." },
  { icon: UsersRound, en: "Review with accountability", ar: "مراجعة بمسؤولية واضحة", detailEn: "Assign translators and reviewers, discuss changes, and preserve an approval trail.", detailAr: "عيّن المترجمين والمراجعين وناقش التغييرات واحتفظ بسجل الاعتماد." },
] as const;

export function LandingPage() {
  const { locale, theme } = useUi();
  const t = copy[locale];
  const isArabic = locale === "ar";

  return (
    <div className="landing-page min-h-dvh overflow-hidden">
      <GlassCursor />
      <header className="sticky top-0 z-40 border-b bg-[color:color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand locale={locale} />
          <nav className="hidden items-center gap-1 rounded-full border bg-[var(--surface-raised)] p-1 text-sm font-semibold text-[var(--muted)] shadow-sm md:flex" aria-label="Primary navigation">
            <a href="#capabilities" className="inline-flex min-h-10 items-center rounded-full px-4 transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]">{t.navFeatures}</a>
            <a href="#process" className="inline-flex min-h-10 items-center rounded-full px-4 transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]">{t.navProcess}</a>
            <Link href="/pricing" className="inline-flex min-h-10 items-center rounded-full px-4 transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]">{t.navPricing}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <UiControls />
            <Link href="/auth/sign-in" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-[var(--subtle)] sm:inline-flex">{t.signIn}</Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.86fr_1.14fr] lg:gap-16 lg:px-8 lg:py-24">
          <div className="hero-enter relative z-10">
            <h1 className="max-w-3xl text-balance text-4xl font-bold leading-[1.06] tracking-[-0.05em] sm:text-6xl lg:text-[4.1rem]">
              {t.titleA}
              <span aria-hidden="true" className="inline-block w-[0.22em]" />
              <DecryptText
                key={locale}
                as="span"
                text={t.titleB}
                glyphs={isArabic ? LATIN_GLYPH_POOL : ARABIC_GLYPH_POOL}
                trigger="inview"
                speed={32}
                stagger={24}
                startDelay={140}
                jitter={50}
                loop={5000}
                retriggerOnHover
                replayOnReentry
                seed={isArabic ? 29 : 13}
                dir={isArabic ? "rtl" : "ltr"}
                className="inline text-[inherit] font-[inherit] leading-[inherit] tracking-[inherit] text-[var(--accent)]"
              />
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:color-mix(in_srgb,var(--foreground)_72%,var(--muted))] sm:text-xl">{t.intro}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/sign-in" className="group">
                <Button size="lg" className="w-full sm:w-auto">{t.start} <ArrowRight aria-hidden="true" size={18} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" /></Button>
              </Link>
              <Link href="/app" className="inline-flex min-h-13 items-center justify-center rounded-xl border bg-[var(--surface)] px-6 text-base font-semibold shadow-sm transition-[background-color,border-color,transform] duration-200 active:scale-[0.985] hover:border-[var(--border-strong)] hover:bg-[var(--subtle)]">{t.signIn}</Link>
            </div>
            <div className="mt-8 grid gap-3 text-sm font-medium text-[color:color-mix(in_srgb,var(--foreground)_72%,var(--muted))] sm:grid-cols-3">
              {[t.trusted, t.privacy, t.noCard].map((item) => (
                <span key={item} className="flex items-start gap-2 border-s ps-3 first:border-s-0 first:ps-0">
                  <CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-[var(--success)]" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div
            className="landing-frost-frame landing-globe-frame hero-enter-delayed document-grid relative flex min-h-[24rem] items-center justify-center overflow-hidden rounded-[2rem] border p-3 sm:min-h-[30rem] sm:p-5"
            aria-label={isArabic ? "كرة أرضية تفاعلية للترجمة العربية والإنجليزية" : "Interactive English and Arabic translation globe"}
          >
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_58%)]" />
            <div className="absolute start-5 top-5 z-10 rounded-full border border-[var(--landing-frost-border)] bg-[color:color-mix(in_srgb,var(--surface)_70%,transparent)] px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur-xl">
              English <span className="mx-1 text-[var(--accent)]">↔</span> العربية
            </div>
            <GlobeLabels
              theme={theme}
              accessibleLabel={isArabic ? "كرة أرضية تفاعلية تعرض كلمات مترجمة بالإنجليزية والعربية" : "Interactive globe showing translated English and Arabic words"}
              className="z-[1] w-full max-w-[30rem]"
            />
            <p className="absolute bottom-5 z-10 rounded-full border border-[var(--landing-frost-border)] bg-[color:color-mix(in_srgb,var(--surface)_72%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] shadow-sm backdrop-blur-xl">
              {isArabic ? "اسحب للاستكشاف · Drag to explore" : "Drag to explore · اسحب للاستكشاف"}
            </p>
          </div>
        </section>

        <section id="capabilities" className="landing-section-wash border-y py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{t.navFeatures}</p><h2 className="mt-3 text-balance text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{t.capabilities}</h2></div>
              <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] lg:justify-self-end">{t.capabilitiesIntro}</p>
            </div>
            <div className="landing-frost-field mt-12 grid gap-4 lg:grid-cols-12">
              {features.map(({ icon: Icon, en, ar, detailEn, detailAr }, index) => (
                <article key={en} className={`landing-frost-card interactive-surface group relative overflow-hidden rounded-[1.4rem] border p-6 sm:p-7 ${index === 0 || index === 3 ? "lg:col-span-7" : "lg:col-span-5"}`}>
                  <div className="flex items-start justify-between gap-5">
                    <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--accent)_13%,transparent)]"><Icon aria-hidden="true" size={20} /></span>
                    <span className="text-xs font-bold tabular-nums text-[var(--muted)]">0{index + 1}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-bold">{isArabic ? ar : en}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">{isArabic ? detailAr : detailEn}</p>
                  <div className="absolute inset-x-6 bottom-0 h-px origin-start scale-x-0 bg-[var(--accent)] transition-transform duration-300 ease-out group-hover:scale-x-100" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{t.navProcess}</p><h2 className="mt-3 text-balance text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{t.steps}</h2><p className="mt-4 text-lg leading-8 text-[var(--muted)]">{t.stepsIntro}</p></div>
          <div className="relative mt-12">
            <div aria-hidden="true" className="absolute inset-x-[16%] top-[3.25rem] hidden h-px bg-[var(--border)] lg:block" />
            <ol className="landing-frost-field grid gap-4 lg:grid-cols-3">
            {[
              ["01", isArabic ? "الرفع والفحص" : "Upload & inspect", isArabic ? "فحص الملف واستخراج النص وتحديد ما يحتاج إلى تصحيح." : "Validate the file, extract its content, and identify anything that needs correction."],
              ["02", isArabic ? "الترجمة والتحرير" : "Translate & edit", isArabic ? "تطبيق القاموس والتحقق من البيانات والتحرير جنباً إلى جنب." : "Apply your glossary, validate critical facts, and edit source and target side by side."],
              ["03", isArabic ? "المراجعة والتصدير" : "Review & export", isArabic ? "تسجيل الاعتماد ثم التصدير إلى Word أو PDF أو نص." : "Record approval, resolve layout warnings, and export DOCX, PDF, or text."],
            ].map(([number, title, detail]) => (
              <li key={number} className="landing-frost-card interactive-surface relative rounded-[1.4rem] border p-6">
                <span className="relative z-10 grid size-14 place-items-center rounded-2xl border bg-[var(--surface)] text-sm font-bold tabular-nums text-[var(--accent)] shadow-sm">{number}</span>
                <h3 className="mt-7 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{detail}</p>
              </li>
            ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="landing-frost-card landing-frost-cta relative overflow-hidden rounded-[2rem] border px-6 py-12 text-[var(--foreground)] sm:px-12">
            <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div><div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:color-mix(in_srgb,var(--foreground)_72%,var(--muted))]"><ShieldCheck aria-hidden="true" size={18} className="text-[var(--accent)]" /> {t.privacy}</div><h2 className="text-3xl font-bold tracking-[-0.04em]">{t.cta}</h2><p className="mt-3 text-[var(--muted)]">{t.ctaSub}</p></div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/sign-in" className="group inline-flex min-h-13 items-center gap-2 rounded-xl bg-[var(--primary)] px-6 font-bold text-white shadow-[var(--shadow-md)] transition-[background-color,transform,box-shadow] duration-200 active:scale-[0.985] hover:bg-[var(--primary-hover)] hover:shadow-[var(--shadow-lg)] dark:text-[#0e1724]">{t.start} <ArrowRight aria-hidden="true" size={18} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" /></Link>
                <Link href="/pricing" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border bg-[var(--surface)] px-6 font-semibold shadow-sm transition-[background-color,border-color,transform] duration-200 active:scale-[0.985] hover:border-[var(--border-strong)] hover:bg-[var(--subtle)]">{t.navPricing}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-[var(--muted)] sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><p>{t.disclaimer}</p><span className="font-semibold text-[var(--foreground)]">{t.waitlist}</span></div>
      </footer>
    </div>
  );
}
