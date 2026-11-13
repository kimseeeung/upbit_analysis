import { describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import {
  canCancelWithdraw,
  deleteScheduledAt,
  deletionNoticeAt,
  retiredLoginId,
  withdrawDoneMessage,
} from "./withdraw";

describe("회원 탈퇴", () => {
  const at = kstDateTime(2026, 11, 13, 10);
  it("5일 뒤 삭제, 하루 전 알림", () => {
    expect(deleteScheduledAt(at)).toEqual(kstDateTime(2026, 11, 18, 10));
    expect(deletionNoticeAt(deleteScheduledAt(at))).toEqual(
      kstDateTime(2026, 11, 17, 10),
    );
  });
  it("5일 안에만 취소 가능", () => {
    const s = deleteScheduledAt(at);
    expect(
      canCancelWithdraw("WITHDRAWING", s, kstDateTime(2026, 11, 18, 9, 59)),
    ).toBe(true);
    expect(
      canCancelWithdraw("WITHDRAWING", s, kstDateTime(2026, 11, 18, 10)),
    ).toBe(false);
    expect(canCancelWithdraw("ACTIVE", s, at)).toBe(false);
  });
  it("완료 안내 문구 (명세 그대로, 삭제 예정일 포함)", () => {
    expect(withdrawDoneMessage(deleteScheduledAt(at))).toBe(
      "탈퇴 신청일로부터 5일 동안 개인정보와 기록이 유지된 뒤 삭제됩니다. 삭제 예정일: 11월 18일. 5일 안에 다시 로그인하면 탈퇴를 취소할 수 있습니다. 탈퇴를 취소해도 취소된 예약은 복구되지 않습니다.",
    );
  });
  it("탈퇴한 아이디는 해시로만 남아 같은 아이디로 재가입할 수 없다", () => {
    expect(retiredLoginId("kim123")).toBe(retiredLoginId("kim123"));
    expect(retiredLoginId("kim123")).not.toContain("kim123");
    expect(retiredLoginId("kim123")).not.toBe(retiredLoginId("kim124"));
  });
});
