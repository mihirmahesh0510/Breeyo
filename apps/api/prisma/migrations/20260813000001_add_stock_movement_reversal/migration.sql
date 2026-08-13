-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "reversed_movement_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversed_movement_id_key" ON "stock_movements"("reversed_movement_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversed_movement_id_fkey" FOREIGN KEY ("reversed_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

