-- CreateTable
CREATE TABLE "Machiaza" (
    "id" TEXT NOT NULL,
    "sourceCode" CHAR(12) NOT NULL,
    "prefecture" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "municipalityCode" CHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machiaza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machiaza_searchKey_idx" ON "Machiaza"("searchKey");

-- CreateIndex
CREATE INDEX "Machiaza_nameKey_idx" ON "Machiaza"("nameKey");

-- CreateIndex
CREATE INDEX "Machiaza_municipalityCode_idx" ON "Machiaza"("municipalityCode");

