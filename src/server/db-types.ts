import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** 서비스 함수는 일반 클라이언트와 트랜잭션 클라이언트를 모두 받는다. */
export type Db = PrismaClient | Prisma.TransactionClient;
export type RootDb = PrismaClient;
