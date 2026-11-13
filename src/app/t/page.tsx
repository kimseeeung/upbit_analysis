import { RoleLayout } from "@/components/RoleHome";
import { TrainerCalendar } from "./TrainerCalendar";

export default function TrainerHome() {
  return (
    <RoleLayout area="trainer">
      <TrainerCalendar />
    </RoleLayout>
  );
}
