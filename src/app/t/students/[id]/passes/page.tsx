import { RoleLayout } from "@/components/RoleHome";
import { PassManager } from "./PassManager";

export default function TrainerPassesPage({
  params,
}: PageProps<"/t/students/[id]/passes">) {
  return (
    <RoleLayout area="trainer">
      <Inner params={params} />
    </RoleLayout>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/t/students/[id]/passes">["params"];
}) {
  const { id } = await params;
  return <PassManager studentId={id} />;
}
