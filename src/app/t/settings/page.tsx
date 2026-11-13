import { RoleLayout } from "@/components/RoleHome";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { NotifySettings } from "./NotifySettings";
import { RulesSettings } from "./RulesSettings";

export default function TrainerSettingsPage() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">설정</h1>
      <AvailabilityEditor />
      <RulesSettings />
      <NotifySettings />
    </RoleLayout>
  );
}
