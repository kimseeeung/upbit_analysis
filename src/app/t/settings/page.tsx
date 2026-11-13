import { RoleLayout } from "@/components/RoleHome";
import { RulesSettings } from "./RulesSettings";

export default function TrainerSettingsPage() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">설정</h1>
      <RulesSettings />
      <p className="text-sm text-zinc-500">
        근무 가능 시간, 전일 알림 시각 설정은 준비 중입니다.
      </p>
    </RoleLayout>
  );
}
