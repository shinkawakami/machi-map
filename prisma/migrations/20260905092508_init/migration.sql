-- CreateEnum
CREATE TYPE "ShelterKind" AS ENUM ('EMERGENCY', 'SHELTER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Municipality" (
    "code" CHAR(5) NOT NULL,
    "prefecture" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "publishedAt" DATE,
    "lastUpdatedAt" DATE,
    "statusCode" TEXT,
    "statusText" TEXT,
    "emergencyCount" INTEGER NOT NULL DEFAULT 0,
    "shelterCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Shelter" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "ShelterKind" NOT NULL,
    "municipalityCode" CHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sameAddressAsOther" BOOLEAN NOT NULL DEFAULT false,
    "flood" BOOLEAN,
    "landslide" BOOLEAN,
    "stormSurge" BOOLEAN,
    "earthquake" BOOLEAN,
    "tsunami" BOOLEAN,
    "fire" BOOLEAN,
    "inlandFlood" BOOLEAN,
    "volcano" BOOLEAN,
    "otherMatters" TEXT,
    "targetPersons" TEXT,
    "note" TEXT,
    "raw" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shelter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_fullName_key" ON "Municipality"("fullName");

-- CreateIndex
CREATE INDEX "Municipality_prefecture_idx" ON "Municipality"("prefecture");

-- CreateIndex
CREATE INDEX "Municipality_statusCode_idx" ON "Municipality"("statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "Shelter_sourceId_key" ON "Shelter"("sourceId");

-- CreateIndex
CREATE INDEX "Shelter_lat_lng_idx" ON "Shelter"("lat", "lng");

-- CreateIndex
CREATE INDEX "Shelter_municipalityCode_idx" ON "Shelter"("municipalityCode");

-- CreateIndex
CREATE INDEX "Shelter_kind_idx" ON "Shelter"("kind");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Shelter" ADD CONSTRAINT "Shelter_municipalityCode_fkey" FOREIGN KEY ("municipalityCode") REFERENCES "Municipality"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
