-- RPT-01 / D-33: the Phase 6 billing dashboard counts distinct pets over
-- consultations finalized inside the IST day. The existing
-- (clinic_id, status) index stops one column short of that predicate, leaving
-- `finalized_at >= <IST midnight>` to a filter over every consultation the
-- clinic has ever finalized.
--
-- This alters a Phase 4 table from a Phase 6 plan on purpose: the index belongs
-- with the table it serves, not with the query that motivated it.

-- CreateIndex
CREATE INDEX "consultations_clinic_id_status_finalized_at_idx" ON "consultations"("clinic_id", "status", "finalized_at");
