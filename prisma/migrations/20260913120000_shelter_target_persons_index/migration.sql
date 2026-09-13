-- 受入対象者（指定福祉避難所）での絞り込みを索引の中で解くため、列を1つ足す。
-- 足さないと "targetPersons" IS NOT NULL が heap を要求し、
-- z8 関東の矩形で Index Only Scan が Parallel Seq Scan に落ちる（buffers 557 → 4,836）。
-- 災害種別8種を載せたとき（Shelter_bbox_filter_idx）と同じ理由・同じ直し方。

-- DropIndex
DROP INDEX "Shelter_bbox_filter_idx";

-- CreateIndex
CREATE INDEX "Shelter_bbox_filter_idx" ON "Shelter"("lat", "lng", "kind", "flood", "landslide", "stormSurge", "earthquake", "tsunami", "fire", "inlandFlood", "volcano", "targetPersons");
