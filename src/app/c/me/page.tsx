import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";

export default function MyInfoPage() {
  return (
    <RoleLayout area="center">
      <h1 className="text-lg font-semibold">내 정보</h1>
      <AccountPanel />
    </RoleLayout>
  );
}
