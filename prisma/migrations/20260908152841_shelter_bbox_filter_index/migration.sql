
-- DropIndex
DROP INDEX "Shelter_lat_lng_idx";

-- CreateIndex
CREATE INDEX "Shelter_bbox_filter_idx" ON "Shelter"("lat", "lng", "kind", "flood", "landslide", "stormSurge", "earthquake", "tsunami", "fire", "inlandFlood", "volcano");

