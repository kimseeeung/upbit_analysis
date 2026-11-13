import "dotenv/config";

// 서비스가 getDb()로 읽는 DATABASE_URL을 테스트 DB로 바꾼다
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
