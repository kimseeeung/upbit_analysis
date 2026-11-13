"use client";

import { useRouter } from "next/navigation";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";

export function AvailabilitySetup() {
  const router = useRouter();
  return <AvailabilityEditor onSaved={() => router.replace("/t")} />;
}
