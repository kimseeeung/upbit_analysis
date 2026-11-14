import { PageHeader } from "@/components/ui";
import { RoleLayout } from "@/components/RoleHome";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { NotifySettings } from "./NotifySettings";
import { RulesSettings } from "./RulesSettings";

export default function TrainerSettingsPage() {
  return (
    <RoleLayout area="trainer">
      <PageHeader title="설정" />
      <AvailabilityEditor />
      <RulesSettings />
      <NotifySettings />
    </RoleLayout>
  );
}
