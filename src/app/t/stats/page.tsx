import { RoleLayout } from "@/components/RoleHome";
import { StatsTable } from "./StatsTable";

export default function StatsPage() {
  return (
    <RoleLayout area="trainer">
      <StatsTable />
    </RoleLayout>
  );
}
