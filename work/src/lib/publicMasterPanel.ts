import { hasStaffRole, normalizeRoles } from "./roles";
import type { StaffMember, StaffServiceRow } from "../types/database";

/** Услуги каталога для публичной записи (минимум полей + категория). */
export type PublicServiceCatalogEntry = {
  id: string;
  active: boolean;
  categoryName: string | null;
};

const NAIL_CATEGORY_RE = /маник|педик|ногт|гель|покрыт|nail|pedicu|manic|lakk|geel/i;

/** По названию категории из CRM — относится к маникюру/педикюру. */
export function isNailServiceCategory(categoryName: string | null | undefined): boolean {
  return NAIL_CATEGORY_RE.test(String(categoryName ?? "").trim());
}

/**
 * Все мастера, которые должны быть в блоке «Свободные мастера»: активные, на сайте,
 * с хотя бы одной публичной привязкой к активной услуге (или менеджер/админ с полным доступом).
 */
export function publicBookableStaffMembers(
  staffList: StaffMember[],
  links: StaffServiceRow[],
  services: PublicServiceCatalogEntry[],
): StaffMember[] {
  const activeIds = new Set(services.filter((s) => s.active).map((s) => s.id));
  return staffList.filter((m) => {
    if (!m.active) return false;
    const pub = links.filter(
      (l) =>
        l.staff_id === m.id &&
        l.show_on_site !== false &&
        activeIds.has(String(l.service_id)),
    );
    if (pub.length > 0) return true;
    const r = normalizeRoles(m.roles);
    return r.includes("manager") || r.includes("admin");
  });
}

/** ID активных услуг, которые мастер делает на публичной записи (или все активные для менеджера). */
export function publicServiceIdsForStaff(
  member: StaffMember,
  links: StaffServiceRow[],
  services: PublicServiceCatalogEntry[],
): Set<string> {
  const active = services.filter((s) => s.active);
  const activeIds = new Set(active.map((s) => s.id));
  const forSt = links.filter((l) => l.staff_id === member.id && l.show_on_site !== false);
  if (
    forSt.length === 0 &&
    (hasStaffRole(member, "manager") || hasStaffRole(member, "admin"))
  ) {
    return activeIds;
  }
  const ids = new Set(
    forSt.map((l) => String(l.service_id)).filter((id) => activeIds.has(id)),
  );
  return ids;
}

export function splitStaffIntoHairAndNails(
  members: StaffMember[],
  links: StaffServiceRow[],
  services: PublicServiceCatalogEntry[],
): { hair: StaffMember[]; nails: StaffMember[] } {
  const byId = new Map(services.map((s) => [s.id, s]));
  const hair: StaffMember[] = [];
  const nails: StaffMember[] = [];
  const seenH = new Set<string>();
  const seenN = new Set<string>();

  for (const m of members) {
    const svcIds = publicServiceIdsForStaff(m, links, services);
    let inHair = false;
    let inNails = false;
    for (const sid of svcIds) {
      const cat = byId.get(sid)?.categoryName ?? null;
      if (isNailServiceCategory(cat)) inNails = true;
      else inHair = true;
    }
    if (!inHair && !inNails) inHair = true;
    if (inHair && !seenH.has(m.id)) {
      hair.push(m);
      seenH.add(m.id);
    }
    if (inNails && !seenN.has(m.id)) {
      nails.push(m);
      seenN.add(m.id);
    }
  }
  return { hair, nails };
}
