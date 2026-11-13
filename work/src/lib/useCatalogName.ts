import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { catalogName } from "./catalogI18n";

/** Названия услуг/категорий хранятся в БД по-русски — переводим их под текущий язык UI. */
export function useCatalogName() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const svcName = useCallback(
    (ru: string | null | undefined) => catalogName("service", ru, lang),
    [lang]
  );
  const catName = useCallback(
    (ru: string | null | undefined) => catalogName("category", ru, lang),
    [lang]
  );
  return { svcName, catName };
}
