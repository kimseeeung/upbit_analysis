import { Suspense } from "react";
import { ApproveLink } from "./ApproveLink";

export default function Page({ params }: PageProps<"/l/approve/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/l/approve/[token]">["params"];
}) {
  const { token } = await params;
  return <ApproveLink token={token} />;
}
