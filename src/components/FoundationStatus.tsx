import { useState } from 'react';

export function FoundationStatus() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section aria-labelledby="foundation-status-title">
      <h2 id="foundation-status-title">Application foundation</h2>
      <p>
        Astro renders the public shell. React is reserved for coordinated interactive application areas.
      </p>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        {expanded ? 'Hide foundation details' : 'Show foundation details'}
      </button>
      {expanded ? (
        <ul>
          <li>Strict TypeScript configuration</li>
          <li>Static output baseline</li>
          <li>React integration for interactive surfaces</li>
          <li>No runtime database dependency for this page</li>
        </ul>
      ) : null}
    </section>
  );
}
