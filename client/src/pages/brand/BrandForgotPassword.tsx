import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandForgotPassword() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/forgot-password", { replace: true });
  }, [navigate]);
  return null;
}
