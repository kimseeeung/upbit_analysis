-- AddForeignKey
ALTER TABLE "CenterInvite" ADD CONSTRAINT "CenterInvite_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
