import { redirect } from "next/navigation";
import { Suspense } from "react";
import { homePathFor } from "@/lib/auth/access";
import { getCurrentSession } from "@/server/auth/current";
import { LoginScreen } from "./login/LoginScreen";

/** 이미 로그인했으면 내 홈으로, 아니면 로그인 화면 */
async function RedirectIfLoggedIn() {
  const s = await getCurrentSession();
  if (s)
    redirect(
      s.userStatus === "WITHDRAWING"
        ? "/withdraw/cancel"
        : homePathFor(s.principal),
    );
  return null;
}

export default function Home() {
  return (
    <>
      <Suspense>
        <RedirectIfLoggedIn />
      </Suspense>
      <LoginScreen />
    </>
  );
}
