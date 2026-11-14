import { PageHeader } from "@/components/ui";
import { RoleLayout } from "@/components/RoleHome";
import { StudentCalendar } from "./StudentCalendar";

export default function StudentHome() {
  return (
    <RoleLayout area="student">
      <PageHeader
        title="내 수업"
        icon="calendar"
        description="예약 가능 칸을 눌러 수업을 신청하세요"
      />
      <StudentCalendar />
    </RoleLayout>
  );
}
