-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "emailOtpEnabled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "emailOtpCode" TEXT;
ALTER TABLE "User" ADD COLUMN "emailOtpExpiresAt" DATETIME;

