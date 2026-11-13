import { RoleLayout } from "@/components/RoleHome";
import { TransferForm } from "./TransferForm";

export default function TransferPage({
  params,
}: PageProps<"/t/students/[id]/transfer">) {
  return (
    <RoleLayout area="trainer">
      <Inner params={params} />
    </RoleLayout>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/t/students/[id]/transfer">["params"];
}) {
  const { id } = await params;
  return <TransferForm studentId={id} />;
}
