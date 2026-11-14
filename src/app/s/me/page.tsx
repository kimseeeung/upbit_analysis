import { PageHeader } from "@/components/ui";
import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";
import { TrainerChange } from "./TrainerChange";

export default function MyInfoPage() {
  return (
    <RoleLayout area="student">
      <PageHeader title="내 정보" />
      <TrainerChange />
      <AccountPanel />
    </RoleLayout>
  );
}
