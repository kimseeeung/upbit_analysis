import { PageHeader } from "@/components/ui";
import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";
import { CenterSection } from "./CenterSection";

export default function MyInfoPage() {
  return (
    <RoleLayout area="trainer">
      <PageHeader title="내 정보" />
      <CenterSection />
      <AccountPanel />
    </RoleLayout>
  );
}
