import { RoleLayout } from "@/components/RoleHome";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { RulesSettings } from "./RulesSettings";

export default function TrainerSettingsPage() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">설정</h1>
      <AvailabilityEditor />
      <RulesSettings />
      <p className="text-sm text-zinc-500">
        전일 알림 시각 설정은 준비 중입니다.
      </p>
    </RoleLayout>
  );
}
