import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
  locale = "en",
}: {
  compact?: boolean;
  className?: string;
  locale?: "en" | "ar";
}) {
  const isArabic = locale === "ar";

  return (
    <Link
      href="/"
      aria-label={isArabic ? "الصفحة الرئيسية للترجمة الإنجليزية والعربية بالذكاء الاصطناعي" : "English Arabic Translate AI home"}
      className={cn("group inline-flex min-h-11 items-center gap-3", className)}
    >
      <span
        aria-hidden="true"
        className="relative grid h-11 w-14 shrink-0 place-items-center transition-transform duration-200 group-hover:scale-[1.03]"
      >
        <Image
          src="/images/brand-logo-qatar.png"
          width={1120}
          height={823}
          alt=""
          className="h-auto w-full object-contain"
          sizes="56px"
        />
      </span>
      {!compact && (
        <span className={cn("leading-tight", isArabic && "font-[family-name:var(--font-arabic)] text-end")}>
          <span className="block whitespace-nowrap text-sm font-bold tracking-[-0.02em]">{isArabic ? "العربية والإنجليزية" : "English Arabic"}</span>
          <span className="block whitespace-nowrap text-xs font-medium text-[var(--muted)]">{isArabic ? "ترجمة ذكية" : "Translate AI"}</span>
        </span>
      )}
    </Link>
  );
}
