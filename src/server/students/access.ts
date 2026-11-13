import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";

/**
 * 트레이너는 자기와 연결된(현재 담당) 수강생만 볼 수 있다(CLAUDE.md 권한).
 * 수강 종료(HIDDEN)는 여전히 담당 기록이므로 볼 수 있다. 끝난 담당(ENDED)은 제외.
 * 없으면 존재 여부를 드러내지 않도록 404로 응답한다.
 */
export async function assertTrainerStudent(
  db: Db,
  trainerId: string,
  studentId: string,
) {
  const link = await db.trainerStudentLink.findFirst({
    where: {
      trainerId,
      studentId,
      endedAt: null,
      status: { in: ["ACTIVE", "HIDDEN"] },
    },
  });
  if (!link) throw new AppError("NOT_FOUND", "수강생을 찾을 수 없습니다", 404);
  return link;
}

/** 수강생 회원(User)의 Student 행 */
export async function getStudentOfUser(db: Db, userId: string) {
  const s = await db.student.findUnique({ where: { userId } });
  if (!s)
    throw new AppError("NOT_FOUND", "수강생 정보를 찾을 수 없습니다", 404);
  return s;
}
