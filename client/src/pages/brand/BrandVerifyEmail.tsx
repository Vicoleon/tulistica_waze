import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandVerifyEmail() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
    navigate(`/verify-email${suffix}`, { replace: true });
  }, [navigate]);
  return null;
}
