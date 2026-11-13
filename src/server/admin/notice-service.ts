import { writeAuditLog } from "@/lib/audit";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { queueNotification } from "@/server/notify/notify-service";

function clean(title: string | undefined, body: string | undefined) {
  const t = title?.trim() ?? "";
  const b = body?.trim() ?? "";
  if (!t || t.length > 100)
    throw new AppError("INVALID", "제목을 1~100자로 입력해 주세요");
  if (!b || b.length > 5000)
    throw new AppError("INVALID", "내용을 1~5000자로 입력해 주세요");
  return { title: t, body: b };
}

export async function listNotices(db: Db) {
  return db.notice.findMany({
    where: { deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 100,
    select: { id: true, title: true, body: true, publishedAt: true },
  });
}

export async function saveNotice(
  db: RootDb,
  operatorId: string,
  input: { id?: string; title: string; body: string },
  now = new Date(),
) {
  const v = clean(input.title, input.body);
  return db.$transaction(async (tx) => {
    const n = input.id
      ? await tx.notice.update({ where: { id: input.id }, data: v })
      : await tx.notice.create({
          data: { ...v, createdById: operatorId, publishedAt: now },
        });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: operatorId },
      entity: "Notice",
      entityId: n.id,
      action: input.id ? "notice.update" : "notice.create",
      after: { title: v.title },
      at: now,
    });
    return n;
  });
}

export async function deleteNotice(
  db: RootDb,
  operatorId: string,
  id: string,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    await tx.notice.update({ where: { id }, data: { deletedAt: now } });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: operatorId },
      entity: "Notice",
      entityId: id,
      action: "notice.delete",
      at: now,
    });
  });
}

// ── 문의 ──

export async function createInquiry(
  db: Db,
  userId: string,
  input: { title: string; body: string },
  now = new Date(),
) {
  const v = clean(input.title, input.body);
  return db.inquiry.create({ data: { ...v, userId, createdAt: now } });
}

export async function listMyInquiries(db: Db, userId: string) {
  return db.inquiry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      answer: true,
      answeredAt: true,
      createdAt: true,
    },
  });
}

export async function listInquiriesForAdmin(
  db: Db,
  input: { unanswered?: boolean },
) {
  const rows = await db.inquiry.findMany({
    where: input.unanswered ? { answeredAt: null } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, role: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    answer: r.answer,
    answeredAt: r.answeredAt,
    createdAt: r.createdAt,
    userId: r.userId,
    userRole: r.user.role,
    userName:
      r.user.name.length <= 1
        ? r.user.name
        : `${r.user.name[0]}${"*".repeat(r.user.name.length - 1)}`,
  }));
}

export async function answerInquiry(
  db: RootDb,
  operatorId: string,
  id: string,
  answer: string,
  now = new Date(),
) {
  const a = answer?.trim() ?? "";
  if (!a || a.length > 5000)
    throw new AppError("INVALID", "답변을 1~5000자로 입력해 주세요");
  await db.$transaction(async (tx) => {
    const q = await tx.inquiry.findUnique({ where: { id } });
    if (!q) throw new AppError("NOT_FOUND", "문의를 찾을 수 없습니다", 404);
    await tx.inquiry.update({
      where: { id },
      data: { answer: a, answeredById: operatorId, answeredAt: now },
    });
    await queueNotification(
      tx,
      {
        userId: q.userId,
        type: "INQUIRY_ANSWERED",
        title: "문의에 답변이 등록되었습니다",
        body: q.title,
        url: "/me/inquiries",
      },
      now,
    );
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: operatorId },
      entity: "Inquiry",
      entityId: id,
      action: "inquiry.answer",
      at: now,
    });
  });
}
