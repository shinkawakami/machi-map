-- 既存行があるので、いったん既定値つきで足してから既定値を外す。
-- （NOT NULL の列をそのまま足すと、191,106 行に入れる値が無くて失敗する）
ALTER TABLE "Machiaza" ADD COLUMN "cityKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Machiaza" ALTER COLUMN "cityKey" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Machiaza_cityKey_idx" ON "Machiaza"("cityKey");
