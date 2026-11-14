import { PageHeader } from "@/components/ui";
import { RoleLayout } from "@/components/RoleHome";
import { ManualNotifyList } from "./ManualNotifyList";

export default function ManualNotifyPage() {
  return (
    <RoleLayout area="trainer">
      <PageHeader title="알림 못 받는 수강생" />
      <p className="text-muted text-sm">
        미가입, 알림 미허용, 발송 실패 수강생입니다. 카톡 공유로 직접 보내
        주세요.
      </p>
      <ManualNotifyList />
    </RoleLayout>
  );
}
