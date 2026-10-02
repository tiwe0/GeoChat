import { nativePreferences, type NativePreferences } from "../../lib/nativePreferences";
import { LEGAL_AGREEMENT_VERSION } from "./legalDocuments";

export const LEGAL_CONSENT_STORAGE_KEY = "geochatLegalConsent" as const;

export type LegalConsentRecord = {
  version: number;
  acceptedAt: string;
};

type LegalConsentPreferences = Pick<NativePreferences, "get" | "set">;

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
}

export function hasAcceptedLegalAgreement(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 2
    && keys.includes("version")
    && keys.includes("acceptedAt")
    && record.version === LEGAL_AGREEMENT_VERSION
    && isCanonicalUtcTimestamp(record.acceptedAt);
}

export function readLegalConsent(
  preferences: Pick<NativePreferences, "get"> = nativePreferences(),
): LegalConsentRecord | undefined {
  const value = preferences.get(LEGAL_CONSENT_STORAGE_KEY);
  return hasAcceptedLegalAgreement(value) ? value : undefined;
}

export async function acceptLegalAgreement(
  preferences: LegalConsentPreferences = nativePreferences(),
  now = new Date(),
): Promise<LegalConsentRecord> {
  const record: LegalConsentRecord = {
    version: LEGAL_AGREEMENT_VERSION,
    acceptedAt: now.toISOString(),
  };
  await preferences.set(LEGAL_CONSENT_STORAGE_KEY, record);
  return record;
}
