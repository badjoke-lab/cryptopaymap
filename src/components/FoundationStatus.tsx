import { useState } from 'react';

export default function FoundationStatus() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="foundation-card" aria-labelledby="foundation-heading">
      <div>
        <p className="eyebrow">Foundation status</p>
        <h2 id="foundation-heading">Astro and React are connected.</h2>
        <p>
          This small interactive island confirms the initial application boundary without
          turning the whole page into a client-rendered application.
        </p>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="foundation-details"
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      {expanded ? (
        <ul id="foundation-details">
          <li>Static Astro page shell</li>
          <li>Strict TypeScript configuration</li>
          <li>Focused React application boundary</li>
        </ul>
      ) : null}
    </section>
  );
}
