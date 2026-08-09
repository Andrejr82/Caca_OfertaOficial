import {
  normalizeMarketplaceSale,
  type AffiliateLinkReference,
  type CanonicalSale,
  type MarketplaceSaleInput,
} from "./canonical-sales";

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseCsvReport(csv: string): Array<Record<string, string>> {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalizedKey(key: string) {
  return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFromRow(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => aliases.includes(normalizedKey(key)));
  return match?.[1] ?? "";
}

function toMarketplaceSaleInput(marketplace: string, userId: string, row: Record<string, unknown>): MarketplaceSaleInput {
  return {
    marketplace,
    userId,
    sourceEventId: String(valueFromRow(row, ["ordereventid", "orderid", "conversionid", "transactionid", "id"])),
    offerId: String(valueFromRow(row, ["offerid", "itemid", "productid"])),
    affiliateLinkId: String(valueFromRow(row, ["affiliatelinkid", "linkid"])) || null,
    subId: String(valueFromRow(row, ["subid", "affiliatesubid", "trackingid"])) || null,
    channel: String(valueFromRow(row, ["channel", "canal"])) || null,
    grossValue: String(valueFromRow(row, ["grossvalue", "ordervalue", "saleamount", "amount", "gmv", "valorbruto"])),
    commissionValue: String(valueFromRow(row, ["commissionvalue", "commission", "commissionamount", "earnings", "comissao"])),
    status: String(valueFromRow(row, ["status", "salestatus", "conversionstatus"])),
    soldAt: String(valueFromRow(row, ["soldat", "saleat", "orderdate", "conversiondate", "date"])),
  };
}

export function normalizeMarketplaceReportRows(
  marketplace: string,
  userId: string,
  rows: Array<Record<string, unknown>>,
  links: AffiliateLinkReference[],
): CanonicalSale[] {
  return rows.map((row) => normalizeMarketplaceSale(toMarketplaceSaleInput(marketplace, userId, row), links));
}
