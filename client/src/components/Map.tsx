/**
 * Tulistica · Map component
 *
 * Auto-switches between Google Maps and Leaflet (OpenStreetMap) based on
 * whether `VITE_GOOGLE_MAPS_API_KEY` is set at build/dev time. Without the
 * key, falls back to Leaflet so the app still works.
 *
 * Both implementations accept the same `MapView` props (TulisticaMapProps).
 * Marker kinds map to brand color tokens (terracotta / sage / peach).
 */

import { useEffect, useMemo, useRef, useState } from "react";

// ============ Public types ============

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
  /** Tile attribution can be replaced if we ever switch tile providers. (Leaflet only.) */
  attribution?: string;
}

// ============ Dispatcher ============

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function MapView(props: TulisticaMapProps) {
  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.length > 0) {
    return <GoogleMapView {...props} />;
  }
  return <LeafletMapView {...props} />;
}

// ============ Google Maps implementation ============

import {
  GoogleMap,
  LoadScriptNext,
  Marker as GMarker,
  Circle as GCircle,
} from "@react-google-maps/api";

const TERRACOTTA = "#b15a3c"; // approx oklch(0.62 0.14 38)
const SAGE = "#8aa97e";       // approx oklch(0.66 0.09 130)
const PEACH = "#eab28b";      // approx oklch(0.88 0.07 52)

function googlePinIcon(kind: MarkerKind): google.maps.Symbol {
  const color =
    kind === "tulistica" ? TERRACOTTA : kind === "google" ? SAGE : PEACH;
  return {
    path: 0 as unknown as google.maps.SymbolPath, // CIRCLE
    scale: kind === "user" ? 8 : 12,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
  };
}

function GoogleMapView({
  className,
  center,
  zoom = 13,
  markers = [],
  highlightedMarkerId,
  radiusKm,
}: TulisticaMapProps) {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const initializedRef = useRef(false);

  // Recenter when `center` changes (skip first pass — handled by initial center prop).
  useEffect(() => {
    if (!mapInstance) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    mapInstance.panTo({ lat: center.lat, lng: center.lng });
  }, [mapInstance, center.lat, center.lng]);

  // FlyTo the highlighted marker.
  useEffect(() => {
    if (!mapInstance || highlightedMarkerId == null) return;
    const m = markers.find((x) => x.id === highlightedMarkerId);
    if (!m) return;
    mapInstance.panTo({ lat: m.lat, lng: m.lng });
    mapInstance.setZoom(15);
  }, [mapInstance, highlightedMarkerId, markers]);

  return (
    <div className={className} style={{ position: "relative", borderRadius: "inherit", overflow: "hidden" }}>
      <LoadScriptNext googleMapsApiKey={GOOGLE_MAPS_API_KEY!}>
        <GoogleMap
          center={{ lat: center.lat, lng: center.lng }}
          zoom={zoom}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            backgroundColor: "rgb(247, 240, 226)",
          }}
          onLoad={(map) => setMapInstance(map)}
          onUnmount={() => setMapInstance(null)}
        >
          {markers.map((m) => (
            <GMarker
              key={m.id}
              position={{ lat: m.lat, lng: m.lng }}
              title={m.title}
              icon={googlePinIcon(m.kind)}
              onClick={m.onClick}
            />
          ))}
          {radiusKm && radiusKm > 0 ? (
            <GCircle
              center={{ lat: center.lat, lng: center.lng }}
              radius={radiusKm * 1000}
              options={{
                strokeColor: TERRACOTTA,
                strokeOpacity: 0.4,
                strokeWeight: 1.5,
                fillColor: TERRACOTTA,
                fillOpacity: 0.06,
                clickable: false,
              }}
            />
          ) : null}
        </GoogleMap>
      </LoadScriptNext>
    </div>
  );
}

// ============ Leaflet (OpenStreetMap) implementation — fallback ============

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

function leafletIconHtml(kind: MarkerKind, title?: string): string {
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
    html: leafletIconHtml(kind, title),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

interface LeafletControllerProps {
  center: { lat: number; lng: number };
  zoom: number;
  highlightedMarker: MapMarker | null;
}

function LeafletController({ center, zoom, highlightedMarker }: LeafletControllerProps) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [map, center.lat, center.lng, zoom]);

  useEffect(() => {
    if (!highlightedMarker) return;
    map.flyTo([highlightedMarker.lat, highlightedMarker.lng], 15, { duration: 0.8 });
  }, [map, highlightedMarker?.id, highlightedMarker?.lat, highlightedMarker?.lng]);

  return null;
}

function LeafletMapView({
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
            eventHandlers={m.onClick ? { click: () => m.onClick?.() } : undefined}
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
        <LeafletController
          center={center}
          zoom={zoom}
          highlightedMarker={highlightedMarker}
        />
      </MapContainer>
    </div>
  );
}

// ============ Pin styles (Leaflet only) ============

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
