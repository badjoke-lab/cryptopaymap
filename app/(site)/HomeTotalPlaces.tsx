'use client';

import { useEffect, useMemo, useState } from 'react';

import fallbackSnapshot from '@/data/fallback/published_places_snapshot.json';

type StatsResponse = {
  total_places?: number;
};

const formatter = new Intl.NumberFormat('en-US');

const countFromSnapshot = (snapshot: unknown): number => {
  if (!snapshot) {
    return 0;
  }

  if (Array.isArray(snapshot)) {
    return snapshot.length;
  }

  if (typeof snapshot !== 'object') {
    return 0;
  }

  const record = snapshot as Record<string, unknown>;
  const places = record.places;
  if (Array.isArray(places)) {
    return places.length;
  }

  const knownArrayKeys = ['items', 'rows', 'data'] as const;
  for (const key of knownArrayKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return 0;
};

const initialCount = countFromSnapshot(fallbackSnapshot);

export function HomeTotalPlaces() {
  const [totalPlaces, setTotalPlaces] = useState<number>(initialCount);

  useEffect(() => {
    const controller = new AbortController();

    const loadTotalPlaces = async () => {
      try {
        const response = await fetch('/api/stats/snapshot', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as StatsResponse;
        if (typeof data.total_places === 'number') {
          setTotalPlaces(data.total_places);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    };

    void loadTotalPlaces();

    return () => {
      controller.abort();
    };
  }, []);

  const label = useMemo(() => formatter.format(totalPlaces), [totalPlaces]);

  return <p className="mt-6 text-sm font-medium text-gray-700 sm:text-base">{label} crypto-friendly places worldwide</p>;
}
