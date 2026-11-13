import { RoleLayout } from "@/components/RoleHome";
import { StudentsList } from "./StudentsList";

export default function TrainerStudentsPage() {
  return (
    <RoleLayout area="trainer">
      <StudentsList />
    </RoleLayout>
  );
}
