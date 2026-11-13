import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";
import { TrainerChange } from "./TrainerChange";

export default function MyInfoPage() {
  return (
    <RoleLayout area="student">
      <h1 className="text-lg font-semibold">내 정보</h1>
      <TrainerChange />
      <AccountPanel />
    </RoleLayout>
  );
}
