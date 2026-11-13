import { RoleLayout } from "@/components/RoleHome";
import { MyPasses } from "./MyPasses";

export default function StudentPassesPage() {
  return (
    <RoleLayout area="student">
      <h1 className="text-lg font-semibold">이용권</h1>
      <MyPasses />
    </RoleLayout>
  );
}
