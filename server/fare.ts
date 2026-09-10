export function calculateDriverSplit(grossFareKobo: number, commissionBps: number) {
  if (!Number.isInteger(grossFareKobo) || grossFareKobo < 0) throw new Error("Gross fare must be a non-negative integer in kobo");
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) throw new Error("Commission must be between 0 and 10000 basis points");
  const platformCommissionKobo = Math.round(grossFareKobo * commissionBps / 10000);
  return { grossFareKobo, platformCommissionKobo, driverEarningKobo: grossFareKobo - platformCommissionKobo, commissionBps };
}
