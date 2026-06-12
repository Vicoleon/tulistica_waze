/**
 * Spanish display labels for raw enum values used across the brand portal.
 * Keep raw values (sent to the API) untouched — translate only at render time.
 */

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  ended: "Finalizada",
};

export const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  sponsored_search: "Búsqueda patrocinada",
  banner: "Banner",
  cart_suggestion: "Sugerencia en carrito",
};

export const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-gray-200 text-gray-700",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  open: "Abierta",
  paid: "Pagada",
  uncollectible: "Incobrable",
  void: "Anulada",
};

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  open: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  uncollectible: "bg-red-100 text-red-800",
  void: "bg-gray-200 text-gray-700",
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status] ?? status;
}

export function campaignTypeLabel(type: string): string {
  return CAMPAIGN_TYPE_LABELS[type] ?? type;
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

const PERIOD_FORMATTER = new Intl.DateTimeFormat("es-CR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-06" → "Junio de 2026" (falls back to the raw string if unparsable). */
export function formatPeriodMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  const label = PERIOD_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
