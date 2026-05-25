import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandResetPassword() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
    navigate(`/reset-password${suffix}`, { replace: true });
  }, [navigate]);
  return null;
}
