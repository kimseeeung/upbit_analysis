import { RoleLayout } from "@/components/RoleHome";
import { StudentStats } from "./StudentStats";

export default function StudentStatsPage({
  params,
}: PageProps<"/t/stats/[studentId]">) {
  return (
    <RoleLayout area="trainer">
      <Inner params={params} />
    </RoleLayout>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/t/stats/[studentId]">["params"];
}) {
  const { studentId } = await params;
  return <StudentStats studentId={studentId} />;
}
