-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "emailVerifyCode" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;

