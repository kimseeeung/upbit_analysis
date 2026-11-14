import { PageHeader } from "@/components/ui";
import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";

export default function MyInfoPage() {
  return (
    <RoleLayout area="center">
      <PageHeader title="내 정보" />
      <AccountPanel />
    </RoleLayout>
  );
}
