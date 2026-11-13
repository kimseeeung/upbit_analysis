import { AccountPanel } from "@/components/AccountPanel";
import { RoleLayout } from "@/components/RoleHome";
import { CenterSection } from "./CenterSection";

export default function MyInfoPage() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">내 정보</h1>
      <CenterSection />
      <AccountPanel />
    </RoleLayout>
  );
}
