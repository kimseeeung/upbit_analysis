"use client";

import { PageShell } from "@/components/ui";
import { FindIdForm } from "./FindIdForm";

export default function FindIdPage() {
  return (
    <PageShell title="아이디 찾기" back={{ href: "/login", label: "로그인" }}>
      <FindIdForm />
    </PageShell>
  );
}
