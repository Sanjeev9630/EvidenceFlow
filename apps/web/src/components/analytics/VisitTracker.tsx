import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { API_URL } from "../../api/client";

/** Logs each route view to POST /analytics/visit → `visited` table. No UI. */
export function VisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const key = `ef:visit:${path}`;
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (last && now - Number(last) < 4000) return;
    sessionStorage.setItem(key, String(now));

    void fetch(`${API_URL}/analytics/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        referrer: document.referrer || null,
        language: navigator.language || null,
        screen: `${window.screen.width}x${window.screen.height}`,
      }),
      keepalive: true,
    }).catch(() => {
      /* silent — analytics must not break the app */
    });
  }, [location.pathname, location.search]);

  return null;
}
