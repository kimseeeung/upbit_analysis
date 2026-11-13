/** 예약의 완료 승인·이견 필드 (캘린더 응답) */
export interface ApprovalFields {
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  approvalMethod:
    | "PIN_ONSITE"
    | "PIN_APP"
    | "AUTO"
    | "TRAINER_CONFIRM"
    | "DISPUTE_RESOLUTION"
    | null;
  trainerConfirmNeeded: boolean;
  disputed: boolean;
  disputeKind: "COMPLETION_REJECTED" | "NO_SHOW_OBJECTION" | null;
  disputeStudentReason: string | null;
  disputeTrainerDecision: "ACCEPT_STUDENT" | "KEEP" | null;
  disputeTrainerReason: string | null;
  disputeResolvedAt: string | null;
}

export const APPROVAL_METHOD_LABEL: Record<
  NonNullable<ApprovalFields["approvalMethod"]>,
  string
> = {
  PIN_ONSITE: "현장 PIN",
  PIN_APP: "앱 PIN",
  AUTO: "자동 완료",
  TRAINER_CONFIRM: "트레이너 확정",
  DISPUTE_RESOLUTION: "이견 처리",
};
