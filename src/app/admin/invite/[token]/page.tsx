import { Suspense } from "react";
import { InviteAccept } from "./InviteAccept";

async function Body({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAccept token={token} />;
}

export default function AdminInvitePage({
  params,
}: PageProps<"/admin/invite/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-xl font-semibold">운영 관리자 초대</h1>
      <Suspense fallback={<p className="text-sm">불러오는 중…</p>}>
        <Body params={params} />
      </Suspense>
    </main>
  );
}
