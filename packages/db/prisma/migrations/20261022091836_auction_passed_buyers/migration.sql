-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "passed_buyer_ids" UUID[] DEFAULT ARRAY[]::UUID[];
