import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { PublicBookingPage } from "./PublicBookingPage";

/**
 * Kiosk/reception mode wrapper.
 * Sets isReceptionMode=true while mounted so UI components
 * (AppTopBar, booking form) know they're running in kiosk context.
 */
export function ReceptionPage() {
  const { setReceptionMode } = useAuth();

  useEffect(() => {
    setReceptionMode(true);
    return () => setReceptionMode(false);
  }, [setReceptionMode]);

  return <PublicBookingPage />;
}
