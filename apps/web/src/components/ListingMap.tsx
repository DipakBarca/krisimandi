'use client';

import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { ListingResult } from '@/lib/types';

// Lalbandi, Sarlahi: where the map opens when nothing has a location.
const PILOT_CENTER: [number, number] = [27.03, 85.62];

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Listings on an OpenStreetMap map. Buyers only ever get the rounded (about 1 km) point,
 * so listings that round to the same spot share one marker that lists them all.
 */
export function ListingMap({ items, here }: { items: ListingResult[]; here?: { lat: number; lng: number } | null }) {
  const { t, name, num } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { scrollWheelZoom: false }).setView(PILOT_CENTER, 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map.current);
        markers.current = L.layerGroup().addTo(map.current);
      }
      const m = map.current;
      const layer = markers.current!;
      layer.clearLayers();

      const groups = new Map<string, ListingResult[]>();
      for (const l of items) {
        if (!l.location) continue;
        const key = `${l.location.lat},${l.location.lng}`;
        groups.set(key, [...(groups.get(key) ?? []), l]);
      }
      const points: [number, number][] = [];
      for (const [key, group] of groups) {
        const [lat, lng] = key.split(',').map(Number);
        points.push([lat, lng]);
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<span>${group.length > 1 ? num(group.length) : escape(name(group[0].crop).slice(0, 1))}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const rows = group
          .map((l) => {
            const price = l.saleMode === 'FIXED' ? l.pricePerUnit : l.auction?.startPrice;
            return `<a href="/listings/${l.id}"><b>${escape(name(l.crop))}</b> ${escape(t('common.rs'))} ${num(price ?? 0)} ${escape(
              t('listing.perUnit', { unit: name(l.unit) }),
            )}</a><br><span>${escape([l.village, name(l.ward.municipality)].filter(Boolean).join(', '))}</span>`;
          })
          .join('<hr>');
        L.marker([lat, lng], { icon, title: group.map((l) => name(l.crop)).join(', ') })
          .bindPopup(`<div class="map-popup">${rows}</div>`)
          .addTo(layer);
      }
      if (here) {
        L.circleMarker([here.lat, here.lng], { radius: 8, color: '#1565c0', fillOpacity: 0.9 }).addTo(layer);
        points.push([here.lat, here.lng]);
      }
      if (points.length === 1) m.setView(points[0], 14);
      else if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
    })();
    return () => {
      cancelled = true;
    };
  }, [items, here, name, num, t]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  const missing = items.filter((l) => !l.location).length;
  return (
    <div className="stack">
      <div ref={el} className="map" role="region" aria-label={t('search.map')} />
      <p className="muted small">
        {t('search.mapApprox')} {missing > 0 && t('search.mapNoLocation', { n: num(missing) })}
      </p>
    </div>
  );
}
