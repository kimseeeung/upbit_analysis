import { RoleLayout } from "@/components/RoleHome";
import { SyncConflicts } from "./SyncConflicts";

export default function Page() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">동기화 충돌</h1>
      <SyncConflicts />
    </RoleLayout>
  );
}
