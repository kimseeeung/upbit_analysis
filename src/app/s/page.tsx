import { RoleLayout } from "@/components/RoleHome";
import { StudentCalendar } from "./StudentCalendar";

export default function StudentHome() {
  return (
    <RoleLayout area="student">
      <StudentCalendar />
    </RoleLayout>
  );
}
