-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "reversed_movement_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversed_movement_id_key" ON "stock_movements"("reversed_movement_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversed_movement_id_fkey" FOREIGN KEY ("reversed_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CodeRabbit: the FK only validates the referenced row exists, not that it
-- differs from this row -- reject a movement from reversing itself.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_reversed_movement_id_not_self"
  CHECK ("reversed_movement_id" IS NULL OR "reversed_movement_id" <> "id");

