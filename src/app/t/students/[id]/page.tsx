import { RoleLayout } from "@/components/RoleHome";
import { StudentDetail } from "./StudentDetail";

export default function TrainerStudentDetailPage({
  params,
}: PageProps<"/t/students/[id]">) {
  return (
    <RoleLayout area="trainer">
      <Detail params={params} />
    </RoleLayout>
  );
}

async function Detail({
  params,
}: {
  params: PageProps<"/t/students/[id]">["params"];
}) {
  const { id } = await params;
  return <StudentDetail id={id} />;
}
