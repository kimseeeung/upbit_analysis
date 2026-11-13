import { Suspense } from "react";
import { LinkRequestLink } from "./LinkRequestLink";

export default function Page({ params }: PageProps<"/l/link/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/l/link/[token]">["params"];
}) {
  const { token } = await params;
  return <LinkRequestLink token={token} />;
}
