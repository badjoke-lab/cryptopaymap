'use client';

import { useEffect, useMemo, useState } from 'react';

type StatsResponse = {
  total_places?: number;
};

const formatter = new Intl.NumberFormat('en-US');

export function HomeTotalPlaces() {
  const [totalPlaces, setTotalPlaces] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadTotalPlaces = async () => {
      try {
        const response = await fetch('/api/stats', {
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

  const label = useMemo(() => {
    if (totalPlaces === null) {
      return '—';
    }
    return formatter.format(totalPlaces);
  }, [totalPlaces]);

  return <p className="mt-6 text-sm font-medium text-gray-700 sm:text-base">{label} crypto-friendly places worldwide</p>;
}
