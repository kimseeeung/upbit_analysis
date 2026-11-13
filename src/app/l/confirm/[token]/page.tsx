import { Suspense } from "react";
import { ConfirmLink } from "./ConfirmLink";

export default function Page({ params }: PageProps<"/l/confirm/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/l/confirm/[token]">["params"];
}) {
  const { token } = await params;
  return <ConfirmLink token={token} />;
}
