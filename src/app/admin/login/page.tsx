import { AdminLoginForm } from "./AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">운영 관리자 로그인</h1>
      <AdminLoginForm />
    </main>
  );
}
