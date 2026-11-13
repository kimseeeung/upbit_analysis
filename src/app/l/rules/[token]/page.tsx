import { Suspense } from "react";
import { RulesLink } from "./RulesLink";

export default function Page({ params }: PageProps<"/l/rules/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({
  params,
}: {
  params: PageProps<"/l/rules/[token]">["params"];
}) {
  const { token } = await params;
  return <RulesLink token={token} />;
}
