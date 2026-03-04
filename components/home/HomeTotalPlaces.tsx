'use client';

import { useEffect, useState } from 'react';

type StatsResponse = {
  total_places?: number;
};

const formatter = new Intl.NumberFormat('en-US');

export function HomeTotalPlaces() {
  const [totalPlaces, setTotalPlaces] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadStats = async () => {
      try {
        const response = await fetch('/api/stats', {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
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
        console.warn('Failed to load total places.');
      }
    };

    void loadStats();

    return () => {
      controller.abort();
    };
  }, []);

  return <p className="mt-6 text-sm font-medium text-gray-700 sm:text-base">{totalPlaces === null ? '—' : formatter.format(totalPlaces)} crypto-friendly places worldwide</p>;
}
