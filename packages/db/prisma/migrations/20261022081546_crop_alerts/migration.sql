-- CreateTable
CREATE TABLE "crop_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "municipality_id" INTEGER,
    "max_price" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crop_alerts_crop_id_idx" ON "crop_alerts"("crop_id");

-- CreateIndex
CREATE INDEX "crop_alerts_user_id_idx" ON "crop_alerts"("user_id");

-- AddForeignKey
ALTER TABLE "crop_alerts" ADD CONSTRAINT "crop_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_alerts" ADD CONSTRAINT "crop_alerts_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_alerts" ADD CONSTRAINT "crop_alerts_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
