import { PageHeader } from "@/components/ui";
import { RequestsInbox } from "@/components/RequestsInbox";
import { RoleLayout } from "@/components/RoleHome";

export default function RequestsPage() {
  return (
    <RoleLayout area="student">
      <PageHeader title="요청함" />
      <RequestsInbox />
    </RoleLayout>
  );
}
