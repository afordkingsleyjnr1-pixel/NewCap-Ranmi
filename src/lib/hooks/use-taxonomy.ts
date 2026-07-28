"use client";

import { useEffect, useState } from "react";

/** Fetches the live, editable Strategies/Focus Areas taxonomy from
 * /api/taxonomy — every client picker uses this instead of importing the
 * hardcoded defaults directly, so Settings edits show up everywhere. */
export function useTaxonomy() {
  const [strategies, setStrategies] = useState<Record<string, string[]>>({});
  const [focusAreas, setFocusAreas] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then((d) => {
        setStrategies(d.strategies ?? {});
        setFocusAreas(d.focusAreas ?? {});
      })
      .finally(() => setLoading(false));
  }, []);

  return { strategies, focusAreas, loading };
}
