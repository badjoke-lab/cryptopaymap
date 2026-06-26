# CryptoPayMap content loaders

## Sources

```text
content/roadmap.yml
content/changelog/*.md
```

`src/content.config.ts` defines separate Astro collections for these sources. The Roadmap uses the `file()` loader for structured YAML. Changelog releases use the `glob()` loader for Markdown. Collection schemas are checked during the static build.

## Roadmap

Roadmap entries contain a section, display order, title, public status, update date, outcome, included capabilities, and dependencies. The page groups them into Now, Next, Later, and Exploring.

## Changelog

Changelog entries contain a version, publication date, summary, draft state, categories, and Markdown body. Draft entries are excluded from `/changelog`. Before the first release, the page shows an empty state.

Stats describes the current dataset. Updates describes record changes. Roadmap describes planned capabilities. Changelog describes released product changes.
