/**
 * Tulistica · Map component (Leaflet + OpenStreetMap)
 *
 * Declarative API: callers pass `markers` as data, not by mutating the map.
 * Migrated from Google Maps (Manus forge proxy) on 2026-05 — Leaflet is free,
 * has no API key, and works offline-friendly. We lose Street View and traffic
 * but those aren't part of Tulistica's value prop.
 *
 * Marker kinds map to brand color tokens (terracotta / sage / peach). To add
 * a new pin style, extend the MarkerKind union and the iconHtml() switch.
 */

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from "react-leaflet";

// ============ Types ============

export type MarkerKind = "tulistica" | "google" | "user";

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  kind: MarkerKind;
  title?: string;
  onClick?: () => void;
}

export interface TulisticaMapProps {
  className?: string;
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  /** When this id changes, the map flyTo()s to that marker and zooms in. */
  highlightedMarkerId?: string | number | null;
  /** Draws a translucent circle around `center` at this radius (km). 0/undefined = no circle. */
  radiusKm?: number;
  /** Tile attribution can be replaced if we ever switch tile providers. */
  attribution?: string;
}

// ============ Icon factory ============
// Custom DivIcons so we can use brand colors + inline SVGs (no PNG assets).

function iconHtml(kind: MarkerKind, title?: string): string {
  switch (kind) {
    case "tulistica":
      return `
        <div class="tul-pin tul-pin-terracotta" title="${escapeHtml(title ?? "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>`;
    case "google":
      return `
        <div class="tul-pin tul-pin-sage" title="${escapeHtml(title ?? "")}">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>`;
    case "user":
      return `
        <div class="tul-pin tul-pin-user" title="Tu ubicación">
          <span class="tul-pin-user-dot"></span>
        </div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeIcon(kind: MarkerKind, title?: string): L.DivIcon {
  const size = kind === "user" ? 22 : kind === "google" ? 30 : 36;
  return L.divIcon({
    className: "tul-pin-wrap",
    html: iconHtml(kind, title),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// ============ Imperative controller (lives inside <MapContainer>) ============

interface MapControllerProps {
  center: { lat: number; lng: number };
  zoom: number;
  highlightedMarker: MapMarker | null;
}

function MapController({ center, zoom, highlightedMarker }: MapControllerProps) {
  const map = useMap();
  const initializedRef = useRef(false);

  // Recenter when `center` changes (e.g. user location resolves).
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [map, center.lat, center.lng, zoom]);

  // Fly to the highlighted marker when it changes.
  useEffect(() => {
    if (!highlightedMarker) return;
    map.flyTo([highlightedMarker.lat, highlightedMarker.lng], 15, {
      duration: 0.8,
    });
  }, [map, highlightedMarker?.id, highlightedMarker?.lat, highlightedMarker?.lng]);

  return null;
}

// ============ Main component ============

export function MapView({
  className,
  center,
  zoom = 13,
  markers = [],
  highlightedMarkerId,
  radiusKm,
  attribution = "&copy; OpenStreetMap contributors",
}: TulisticaMapProps) {
  const highlightedMarker = useMemo(
    () => markers.find((m) => m.id === highlightedMarkerId) ?? null,
    [markers, highlightedMarkerId]
  );

  return (
    <div className={className} style={{ position: "relative" }}>
      <PinStyles />
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", borderRadius: "inherit" }}
      >
        <TileLayer
          attribution={attribution}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={makeIcon(m.kind, m.title)}
            eventHandlers={
              m.onClick ? { click: () => m.onClick?.() } : undefined
            }
          />
        ))}
        {radiusKm && radiusKm > 0 ? (
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "oklch(0.62 0.14 38)",
              weight: 1.5,
              opacity: 0.4,
              fillColor: "oklch(0.62 0.14 38)",
              fillOpacity: 0.06,
            }}
          />
        ) : null}
        <MapController
          center={center}
          zoom={zoom}
          highlightedMarker={highlightedMarker}
        />
      </MapContainer>
    </div>
  );
}

// ============ Pin styles ============
// Inlined so the component is self-contained and doesn't require touching
// index.css. The styles are scoped to .tul-pin* class names.

function PinStyles() {
  return (
    <style>{`
      .tul-pin-wrap {
        background: transparent !important;
        border: none !important;
      }
      .tul-pin {
        width: 100%; height: 100%;
        border-radius: 9999px;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 14px -4px rgba(56,36,18,0.45);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: transform 200ms ease, box-shadow 200ms ease;
      }
      .tul-pin:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px -6px rgba(56,36,18,0.5);
      }
      .tul-pin svg { width: 50%; height: 50%; }
      .tul-pin-terracotta { background: oklch(0.62 0.14 38); color: #ffffff; }
      .tul-pin-sage       { background: oklch(0.66 0.09 130); color: #ffffff; opacity: 0.94; }
      .tul-pin-user       { background: oklch(0.88 0.07 52); }
      .tul-pin-user .tul-pin-user-dot {
        width: 38%; height: 38%;
        border-radius: 9999px;
        background: oklch(0.62 0.14 38);
      }
      /* Leaflet container in our paper theme */
      .leaflet-container {
        font-family: inherit;
        background: oklch(0.93 0.025 78);
      }
      .leaflet-control-attribution {
        font-size: 10px !important;
        background: rgba(255,255,255,0.85) !important;
      }
    `}</style>
  );
}
