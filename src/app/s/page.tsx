import { RoleLayout } from "@/components/RoleHome";

export default function StudentHome() {
  return (
    <RoleLayout area="student">
      <h1 className="text-lg font-semibold">내 수업</h1>
      <p className="text-sm text-zinc-500">수업 캘린더는 준비 중입니다.</p>
    </RoleLayout>
  );
}
