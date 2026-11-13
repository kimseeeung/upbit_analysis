import { RequestsInbox } from "@/components/RequestsInbox";
import { RoleLayout } from "@/components/RoleHome";

export default function RequestsPage() {
  return (
    <RoleLayout area="trainer">
      <h1 className="text-lg font-semibold">요청함</h1>
      <RequestsInbox />
    </RoleLayout>
  );
}
