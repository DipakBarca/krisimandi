-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "buyer_paid_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_id" UUID,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "farmer_paid_at" TIMESTAMP(3);
