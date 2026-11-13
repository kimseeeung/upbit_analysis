/**
 * 센터 권한 범위 (명세 7, 9). 순수 함수.
 * - 센터 관리자는 소속 트레이너 범위만 조회한다 (서버에서 매 요청 검사)
 * - 소속 기간 안의 기록만 본다: 이동·해제한 트레이너는 소속 기간(가입~해제)의 결제·수업 기록만
 * - 트레이너를 따라간 수강생의 연락처는 가린다
 * - 남은 이용권 이동 승인은 본인이 관련된 건(이전·새 트레이너)이면 할 수 없다
 */

export interface MembershipWindow {
  trainerId: string;
  /** 소속 시작 (포함) */
  joinedAt: Date;
  /** 소속 끝 (포함하지 않음). 지금 소속이면 null */
  leftAt: Date | null;
}

export function inWindow(w: MembershipWindow, at: Date): boolean {
  return w.joinedAt <= at && (w.leftAt === null || at < w.leftAt);
}

/** 이 시각에 이 트레이너의 기록을 센터가 볼 수 있는가 */
export function centerCanSee(
  windows: readonly MembershipWindow[],
  trainerId: string,
  at: Date,
): boolean {
  return windows.some((w) => w.trainerId === trainerId && inWindow(w, at));
}

/** 지금 소속 트레이너 */
export function currentMembers(windows: readonly MembershipWindow[]): string[] {
  return [
    ...new Set(
      windows.filter((w) => w.leftAt === null).map((w) => w.trainerId),
    ),
  ];
}

/** 센터에서 보이는 트레이너 (지금·과거 소속) */
export function visibleTrainers(
  windows: readonly MembershipWindow[],
): string[] {
  return [...new Set(windows.map((w) => w.trainerId))];
}

/**
 * 수강생 연락처를 센터에 보여 줄 수 있는가.
 * 지금 담당 트레이너가 이 센터 소속일 때만. 트레이너를 따라 센터를 떠난 수강생은 가린다.
 */
export function centerCanSeeContact(
  windows: readonly MembershipWindow[],
  currentTrainerId: string | null,
): boolean {
  return (
    !!currentTrainerId && currentMembers(windows).includes(currentTrainerId)
  );
}

/**
 * 센터 관리자가 남은 이용권 이동을 승인할 수 있는가 (7.2, 9.1).
 * 같은 센터 안의 인계이고, 승인하는 관리자가 이전·새 트레이너가 아니어야 한다.
 */
export function canCenterApprovePassTransfer(input: {
  adminUserId: string;
  fromTrainerId: string | null;
  toTrainerId: string;
  members: readonly string[];
}): { ok: true } | { ok: false; reason: "SELF_INVOLVED" | "NOT_SAME_CENTER" } {
  if (
    input.adminUserId === input.fromTrainerId ||
    input.adminUserId === input.toTrainerId
  ) {
    return { ok: false, reason: "SELF_INVOLVED" };
  }
  if (
    !input.fromTrainerId ||
    !input.members.includes(input.fromTrainerId) ||
    !input.members.includes(input.toTrainerId)
  ) {
    return { ok: false, reason: "NOT_SAME_CENTER" };
  }
  return { ok: true };
}

/** 이동·탈퇴 선택의 무응답 기본값 (7.3, 7.4) */
export function departureDefault(
  type: "MOVE" | "WITHDRAW",
  trainerInCenter: boolean,
): "FOLLOW" | "CENTER_ASSIGN" | "FIND_OWN" {
  if (type === "MOVE") return "FOLLOW";
  return trainerInCenter ? "CENTER_ASSIGN" : "FIND_OWN";
}

/** 선택 기한: 이동 7일, 탈퇴 5일 */
export function departureDeadline(type: "MOVE" | "WITHDRAW", now: Date): Date {
  return new Date(now.getTime() + (type === "MOVE" ? 7 : 5) * 86400_000);
}

/** 고를 수 있는 선택지: "따라가기"는 이동 때만, 개인 트레이너 탈퇴는 "직접 찾기"만 */
export function departureOptions(
  type: "MOVE" | "WITHDRAW",
  trainerInCenter: boolean,
): ("FOLLOW" | "STAY" | "CENTER_ASSIGN" | "FIND_OWN")[] {
  if (type === "MOVE") return trainerInCenter ? ["FOLLOW", "STAY"] : ["FOLLOW"];
  return trainerInCenter ? ["CENTER_ASSIGN", "FIND_OWN"] : ["FIND_OWN"];
}

/**
 * 날짜만 있는 기록(결제일 등)은 한국 날짜로 비교한다.
 * 소속한 날의 결제는 포함, 떠난 날부터의 결제는 제외.
 */
export function centerCanSeeDate(
  windows: readonly MembershipWindow[],
  trainerId: string,
  dateKey: string,
  toDateKey: (d: Date) => string,
): boolean {
  return windows.some(
    (w) =>
      w.trainerId === trainerId &&
      toDateKey(w.joinedAt) <= dateKey &&
      (w.leftAt === null || dateKey < toDateKey(w.leftAt)),
  );
}
