import { PageHeader } from "@/components/ui";
import { RoleLayout } from "@/components/RoleHome";
import { MyPasses } from "./MyPasses";

export default function StudentPassesPage() {
  return (
    <RoleLayout area="student">
      <PageHeader title="이용권" />
      <MyPasses />
    </RoleLayout>
  );
}
