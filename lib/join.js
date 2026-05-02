// Inner-join Meta leads ↔ sheet rows on (formName|phone) or (formName|email)
import { normalizePhone, normalizeEmail } from './meta-client.js';

export function buildSheetIndex(sheetLeads) {
  const byPhone = new Map();
  const byEmail = new Map();

  for (const lead of sheetLeads) {
    const phone = normalizePhone(lead.phone);
    const email = normalizeEmail(lead.email);
    const form  = (lead.formName || '').toLowerCase();

    if (phone) {
      const key = `${form}|${phone}`;
      if (!byPhone.has(key)) byPhone.set(key, lead);
    }
    if (email) {
      const key = `${form}|${email}`;
      if (!byEmail.has(key)) byEmail.set(key, lead);
    }
  }

  return { byPhone, byEmail };
}

export function lookupSheetLead(metaLead, formName, index) {
  const phone = normalizePhone(metaLead.phone);
  const email = normalizeEmail(metaLead.email);
  const form  = (formName || '').toLowerCase();

  if (phone) {
    const hit = index.byPhone.get(`${form}|${phone}`);
    if (hit) return hit;
  }
  if (email) {
    const hit = index.byEmail.get(`${form}|${email}`);
    if (hit) return hit;
  }
  return null;
}
