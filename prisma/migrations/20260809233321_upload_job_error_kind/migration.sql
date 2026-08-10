-- CreateEnum
CREATE TYPE "JobErrorKind" AS ENUM ('TRANSIENT', 'VALIDATION');

-- AlterTable
ALTER TABLE "UploadJob" ADD COLUMN     "errorKind" "JobErrorKind";
