import { PageHeader, QuickMenu } from "@/components/ui";
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
      <QuickMenu
        items={[
          { href: "/s/requests", label: "요청함", icon: "inbox" },
          { href: "/s/passes", label: "이용권", icon: "ticket" },
          { href: "/me/notices", label: "공지사항", icon: "megaphone" },
          { href: "/me/inquiries", label: "문의하기", icon: "question" },
        ]}
      />
      <StudentCalendar />
    </RoleLayout>
  );
}
