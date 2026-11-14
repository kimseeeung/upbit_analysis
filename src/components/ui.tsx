"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  UserPlus,
  ArrowRight,
  BadgeCheck,
  Bell,
  Download,
  ListChecks,
  LogIn,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Undo2,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudUpload,
  CreditCard,
  DoorOpen,
  Dumbbell,
  Eye,
  EyeOff,
  History,
  Inbox,
  Info,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  MessageCircleQuestion,
  NotebookPen,
  PauseCircle,
  ScrollText,
  Settings,
  BarChart3,
  RefreshCw,
  Smartphone,
  Smile,
  Sparkles,
  Ticket,
  UserRound,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  hangulToQwerty,
  hasHangul,
  keyboardForLabel,
  type KeyboardLang,
} from "@/lib/input/keyboard";

/* ── 아이콘: 서버 화면에서도 이름(문자열)으로 넘길 수 있게 ── */
export const ICONS = {
  bell: Bell,
  building: Building2,
  calendar: CalendarDays,
  check: CheckCircle2,
  clipboard: ClipboardList,
  clock: Clock,
  cloud: CloudUpload,
  card: CreditCard,
  door: DoorOpen,
  dumbbell: Dumbbell,
  history: History,
  inbox: Inbox,
  key: KeyRound,
  lock: Lock,
  mail: Mail,
  megaphone: Megaphone,
  question: MessageCircleQuestion,
  memo: NotebookPen,
  pause: PauseCircle,
  scroll: ScrollText,
  settings: Settings,
  chart: BarChart3,
  refresh: RefreshCw,
  send: Send,
  phone: Smartphone,
  smile: Smile,
  sparkles: Sparkles,
  ticket: Ticket,
  user: UserRound,
  userPlus: UserPlus,
  search: Search,
  login: LogIn,
  users: Users,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

/** 카드 제목으로 어울리는 아이콘을 고른다 (따로 정하지 않았을 때) */
const TITLE_ICONS: [RegExp, IconName][] = [
  [/알림 못 받는|직접 보낼/, "send"],
  [/알림|수신/, "bell"],
  [/설정/, "settings"],
  [/동기화 충돌/, "refresh"],
  [/기기/, "phone"],
  [/백업|동기화/, "cloud"],
  [/비밀번호/, "key"],
  [/PIN/, "lock"],
  [/탈퇴/, "door"],
  [/공지/, "megaphone"],
  [/문의/, "question"],
  [/이용권|수강권/, "ticket"],
  [/규칙|약관/, "scroll"],
  [/센터/, "building"],
  [/트레이너/, "dumbbell"],
  [/수강생/, "users"],
  [/결제/, "card"],
  [/근무|시간/, "clock"],
  [/일시정지/, "pause"],
  [/메모/, "memo"],
  [/기록|내역/, "history"],
  [/요청/, "inbox"],
  [/초대/, "mail"],
  [/일정|예약|수업|캘린더/, "calendar"],
  [/정보|프로필|전화/, "user"],
  [/현황|통계/, "chart"],
];
export function iconForTitle(title: string): IconName {
  return TITLE_ICONS.find(([re]) => re.test(title))?.[1] ?? "sparkles";
}

const BUBBLES = [
  "bg-brand-100 text-brand-600 dark:bg-brand-700/30 dark:text-brand-200",
  "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-200",
  "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-200",
];

/** 동그란 파스텔 배경 아이콘 */
export function IconBubble({
  name,
  size = "md",
}: {
  name: IconName;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = ICONS[name];
  const tone = BUBBLES[Object.keys(ICONS).indexOf(name) % BUBBLES.length];
  const box = { sm: "size-7", md: "size-9", lg: "size-12" }[size];
  const icon = { sm: "size-4", md: "size-5", lg: "size-6" }[size];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${box} ${tone}`}
    >
      <Icon className={icon} strokeWidth={2} />
    </span>
  );
}

/** 로고: 앱 아이콘 + 이름(머슬매니아) */
export function Logo({
  sub,
  size = "md",
}: {
  sub?: string;
  size?: "md" | "lg";
}) {
  const px = size === "lg" ? 40 : 32;
  return (
    <span className="inline-flex items-center gap-2 font-extrabold whitespace-nowrap">
      <Image
        src="/icons/icon.svg"
        alt=""
        width={px}
        height={px}
        unoptimized
        className="shadow-brand-500/30 rounded-[10px] shadow-sm"
      />
      <span className={size === "lg" ? "text-xl" : ""}>
        머슬매니아
        {sub && (
          <span className="text-muted ml-1 text-sm font-medium">· {sub}</span>
        )}
      </span>
    </span>
  );
}

/** 뒤로 가기: 화살표 아이콘이 있는 알약 버튼 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="border-line bg-surface text-muted hover:border-brand-300 hover:text-foreground inline-flex items-center gap-1 self-start rounded-full border py-1.5 pr-3 pl-2 text-sm font-semibold transition"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/** 버튼 모양 링크 (아이콘 + 글자). 글자에 맞는 아이콘을 자동으로 붙인다 */
export function LinkButton({
  href,
  icon,
  variant = "secondary",
  stack = false,
  className = "",
  children,
}: {
  href: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "soft";
  /** 아이콘 위, 글자 아래 (작은 타일 버튼) */
  stack?: boolean;
  className?: string;
  children: string;
}) {
  const Icon = icon ? ICONS[icon] : null;
  const auto = Icon ? (
    <Icon className="size-4 shrink-0" aria-hidden />
  ) : (
    buttonIconElement(children)
  );
  const style = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    secondary: "bg-fill hover:bg-line",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-700/20 dark:text-brand-100",
  }[variant];
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] ${stack ? "flex-col gap-1 px-2 py-3 text-xs" : "gap-1.5 px-4 py-2.5 text-sm"} ${style} ${className}`}
    >
      {auto}
      {children}
    </Link>
  );
}

/** 메뉴 줄: 아이콘 · 글자 · › (내 정보, 바로가기 목록) */
export function MenuLink({
  href,
  icon,
  children,
  sub,
}: {
  href: string;
  icon?: IconName;
  children: string;
  sub?: ReactNode;
}) {
  const Icon = ICONS[icon ?? iconForTitle(children)];
  return (
    <Link
      href={href}
      className="hover:bg-fill flex items-center justify-between gap-2 px-5 py-4 transition"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="text-brand-500 size-5 shrink-0" aria-hidden />
        <span className="truncate text-[17px] font-bold">{children}</span>
        {sub && <span className="text-muted truncate text-sm">{sub}</span>}
      </span>
      <ChevronRight className="text-muted size-5 shrink-0" aria-hidden />
    </Link>
  );
}

/** 바로가기 아이콘 메뉴 (홈 화면 위쪽) */
export function QuickMenu({
  items,
}: {
  items: { href: string; label: string; icon: IconName; badge?: number }[];
}) {
  return (
    <nav
      aria-label="바로가기"
      className="bg-surface grid grid-cols-4 gap-1 rounded-2xl px-2 py-4"
    >
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="hover:bg-fill relative flex flex-col items-center gap-1.5 rounded-xl py-1 text-[13px] font-semibold"
        >
          <IconBubble name={it.icon} size="lg" />
          {it.label}
          {!!it.badge && (
            <span className="absolute top-0 right-3 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[11px] font-bold text-white">
              {it.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** 불러오는 중: 반짝이는 빈 상자 (스켈레톤) */
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3" aria-live="polite">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="from-brand-50 via-brand-100/70 to-brand-50 dark:from-brand-700/10 dark:via-brand-700/25 dark:to-brand-700/10 h-16 animate-pulse rounded-2xl bg-gradient-to-r"
          style={{ opacity: 1 - i * 0.2 }}
        />
      ))}
    </div>
  );
}

export function PageShell({
  title,
  back,
  icon,
  children,
}: {
  title: string;
  back?: { href: string; label?: string };
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      {back && (
        <Link href={back.href} className="text-muted text-sm">
          ← {back.label ?? "뒤로"}
        </Link>
      )}
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <IconBubble name={icon ?? iconForTitle(title)} />
        {title}
      </h1>
      {children}
    </main>
  );
}

/** 버튼 글자에 어울리는 아이콘 (글자만 있는 버튼에 자동으로 붙임) */
const BUTTON_ICONS: [RegExp, LucideIcon][] = [
  [/카톡/, MessageCircle],
  [/^로그인$/, LogIn],
  [/회원가입|가입/, UserPlus],
  [/비밀번호/, KeyRound],
  [/수락|확인|승인|동의/, BadgeCheck],
  [/거절|취소|닫기/, X],
  [/되돌|복구|재개/, Undo2],
  [/저장/, Save],
  [/삭제|비활성화|해제/, Trash2],
  [/검색|찾기/, Search],
  [/다운로드/, Download],
  [/보내기|요청|신청|제안|공유/, Send],
  [/등록|추가|만들기|초대/, Plus],
  [/수정|변경|편집/, Pencil],
  [/선택|고르기/, ListChecks],
  [/다음|계속|시작/, ArrowRight],
];
export function buttonIcon(label: string): LucideIcon | null {
  return BUTTON_ICONS.find(([re]) => re.test(label))?.[1] ?? null;
}
function buttonIconElement(label: string): ReactNode {
  const Icon = buttonIcon(label);
  return Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  icon = true,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** false면 자동 아이콘을 붙이지 않음 */
  icon?: boolean;
}) {
  const auto =
    icon && variant !== "ghost" && typeof children === "string"
      ? buttonIconElement(children)
      : null;
  const styles = {
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98] disabled:bg-brand-200 dark:disabled:bg-brand-700/40",
    secondary:
      "bg-fill text-foreground hover:bg-line active:scale-[0.98] disabled:text-muted",
    danger:
      "bg-rose-500 text-white hover:bg-rose-600 active:scale-[0.98] disabled:bg-rose-200",
    ghost: "text-muted underline-offset-2 hover:underline",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[15px] font-bold transition disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    >
      {auto}
      {children}
    </button>
  );
}

const FIELD =
  "w-full rounded-xl border border-transparent bg-fill px-4 py-3 text-base outline-none transition placeholder:text-muted/70 focus:border-brand-400 focus:bg-surface disabled:opacity-60";

/**
 * 입력 칸. keyboard: 영문 칸(아이디·비밀번호)은 한글 자판으로 친 글자를 영문으로 바꿔 주고,
 * 한글 칸은 한국어 입력을 알린다. 지정하지 않으면 칸 이름으로 정한다.
 */
export function TextField({
  label,
  hint,
  error,
  className = "",
  keyboard,
  onChange,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  keyboard?: KeyboardLang | null;
}) {
  const id = useId();
  const composing = useRef(false);
  const lang =
    keyboard === undefined ? keyboardForLabel(label, props.type) : keyboard;
  const en = lang === "en";

  /** 한글로 친 글자를 영문으로 바꿔 부모에게 알린다 */
  function emit(e: React.SyntheticEvent<HTMLInputElement>) {
    const raw = e.currentTarget.value;
    if (!en || !hasHangul(raw)) return false;
    const value = hangulToQwerty(raw);
    e.currentTarget.value = value;
    onChange?.({
      ...e,
      target: e.currentTarget,
      currentTarget: e.currentTarget,
    } as React.ChangeEvent<HTMLInputElement>);
    return true;
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-muted text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={FIELD}
        aria-invalid={!!error}
        lang={lang ?? undefined}
        {...(en
          ? {
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
            }
          : {})}
        {...props}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          emit(e);
        }}
        onChange={(e) => {
          if (en && !composing.current && emit(e)) return;
          onChange?.(e);
        }}
        onBlur={(e) => {
          emit(e);
          props.onBlur?.(e);
        }}
      />
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-muted text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** 비밀번호 마스킹 + 보기 토글 (명세 2.1). 영문 칸 */
export function PasswordField(
  props: Omit<React.ComponentProps<typeof TextField>, "type">,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextField keyboard="en" {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="text-muted hover:bg-brand-50 dark:hover:bg-brand-700/20 absolute top-9 right-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs"
        aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
        {shown ? "숨기기" : "보기"}
      </button>
    </div>
  );
}

/** 드롭다운 공통 모양 */
export const SELECT =
  "rounded-xl border border-transparent bg-fill px-3 py-3 text-base outline-none transition focus:border-brand-400 focus:bg-surface";

export function Checkbox({
  label,
  checked,
  onChange,
  children,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-brand-500 mt-0.5 size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1">{label}</span>
      {children}
    </label>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warning";
  children: ReactNode;
}) {
  const styles = {
    info: "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100",
    error: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
    success:
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  }[tone];
  const Icon = {
    info: Info,
    error: XCircle,
    success: CheckCircle2,
    warning: AlertTriangle,
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 내 정보처럼 메뉴 목록으로 보여 줄 때: 안의 카드를 눌러서 펼치는 줄로 바꾼다 */
const CollapseContext = createContext(false);
export function CollapsibleCards({ children }: { children: ReactNode }) {
  return (
    <CollapseContext.Provider value={true}>
      <div className="bg-surface divide-line flex flex-col divide-y overflow-hidden rounded-2xl">
        {children}
      </div>
    </CollapseContext.Provider>
  );
}

export function Card({
  title,
  icon,
  count,
  actions,
  collapsible,
  children,
}: {
  title?: string;
  icon?: IconName;
  /** 목록 개수 */
  count?: number;
  /** 제목 오른쪽 버튼 */
  actions?: ReactNode;
  /** 눌러서 펼치는 줄 (지정하지 않으면 CollapsibleCards 안에서만) */
  collapsible?: boolean;
  children: ReactNode;
}) {
  const inGroup = useContext(CollapseContext);
  const fold = (collapsible ?? inGroup) && !!title;
  const [open, setOpen] = useState(false);
  const Icon = title ? ICONS[icon ?? iconForTitle(title)] : null;
  const heading = title && Icon && (
    <span className="flex min-w-0 items-center gap-2.5">
      <Icon
        className="text-brand-500 size-5 shrink-0"
        strokeWidth={2}
        aria-hidden
      />
      <span className="truncate text-[17px] font-bold">{title}</span>
      {count !== undefined && (
        <span className="text-brand-500 text-[15px] font-bold">{count}</span>
      )}
    </span>
  );
  if (fold)
    return (
      <section className="flex flex-col">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="hover:bg-fill flex items-center justify-between gap-2 px-5 py-4 text-left transition"
        >
          {heading}
          <ChevronRight
            className={`text-muted size-5 shrink-0 transition ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
        </button>
        {open && (
          <div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
        )}
      </section>
    );
  return (
    <section
      className={`flex flex-col gap-3 ${inGroup ? "px-5 py-4" : "bg-surface rounded-2xl p-5"}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0">{heading}</h2>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * 화면 제목 영역: 아이콘 + 제목 + 설명, 오른쪽에 주요 버튼.
 * 모든 화면 맨 위에 같은 모양으로 둔다.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  /** 예전 호출 호환용 (제목 영역은 아이콘 없이 깔끔하게) */
  icon?: IconName;
  description?: ReactNode;
  /** 오른쪽 버튼 */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-extrabold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted mt-1 text-sm">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </header>
  );
}

/**
 * 조회 조건 영역: 기간·검색·필터를 한 상자에 모아 목록과 구분한다.
 */
export function FilterBar({
  title = "조회 조건",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="bg-surface flex flex-col gap-3 rounded-2xl p-4"
    >
      <p className="text-muted flex items-center gap-1.5 text-[13px] font-bold">
        <SlidersHorizontal className="text-brand-500 size-4" aria-hidden />
        {title}
      </p>
      {children}
    </section>
  );
}

/** 목록 위 소제목 (카드 여러 개로 된 목록에 씀) */
export function SectionTitle({
  title,
  icon,
  count,
}: {
  title: string;
  icon?: IconName;
  count?: number;
}) {
  const Icon = ICONS[icon ?? iconForTitle(title)];
  return (
    <h2 className="flex items-center gap-2 px-1 pt-2 text-[17px] font-bold">
      <Icon className="text-brand-500 size-5" aria-hidden />
      {title}
      {count !== undefined && (
        <span className="text-brand-500 font-bold">{count}</span>
      )}
    </h2>
  );
}

/** 요약 숫자 카드 (총 수업 수 등) */
export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="bg-surface flex items-center gap-3 rounded-2xl p-4">
      <IconBubble name={icon ?? iconForTitle(label)} size="md" />
      <div className="min-w-0">
        <p className="text-muted text-[13px]">{label}</p>
        <p className="text-lg font-extrabold">{value}</p>
      </div>
    </div>
  );
}

/** 비어 있을 때 귀여운 안내 */
export function EmptyState({
  icon = "smile",
  children,
}: {
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface text-muted flex flex-col items-center gap-3 rounded-2xl px-4 py-10 text-center text-sm">
      <IconBubble name={icon} size="lg" />
      <div>{children}</div>
    </div>
  );
}

export const ROLE_LABEL = {
  TRAINER: "트레이너",
  STUDENT: "수강생",
  CENTER_ADMIN: "센터 관리자",
} as const;
export type RoleKey = keyof typeof ROLE_LABEL;
const ROLE_ICON: Record<RoleKey, LucideIcon> = {
  TRAINER: Dumbbell,
  STUDENT: Smile,
  CENTER_ADMIN: Building2,
};

export function RoleTabs({
  value,
  onChange,
}: {
  value: RoleKey | null;
  onChange: (r: RoleKey) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="회원 유형"
      className="bg-fill grid grid-cols-3 gap-1 rounded-2xl p-1"
    >
      {(Object.keys(ROLE_LABEL) as RoleKey[]).map((r) => {
        const Icon = ROLE_ICON[r];
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={value === r}
            onClick={() => onChange(r)}
            className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-sm font-bold transition ${
              value === r
                ? "bg-surface text-brand-600 dark:text-brand-200 shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-5" aria-hidden />
            {ROLE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

/** 화면 위에 뜨는 시트/팝업 (모바일은 아래에서, PC는 가운데) */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-line mx-auto h-1 w-10 rounded-full sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <IconBubble name={iconForTitle(title)} size="sm" />
            {title}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            className="text-muted hover:bg-brand-50 dark:hover:bg-brand-700/20 rounded-full p-1.5"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
