import { PageHeader } from "@/components/ui";
import { RoleLayout } from "@/components/RoleHome";
import { SyncConflicts } from "./SyncConflicts";

export default function Page() {
  return (
    <RoleLayout area="trainer">
      <PageHeader title="동기화 충돌" />
      <SyncConflicts />
    </RoleLayout>
  );
}
