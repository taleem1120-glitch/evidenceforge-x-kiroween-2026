/*
 * EvidenceForge X
 * Provenance-aware Case Review Engine
 * Local, deterministic, explainable.
 */

const RELATIONS = new Set([
  "observed_on",
  "references",
  "transferred_to",
  "derived_from",
  "corroborates",
  "contradicts"
]);

const record = x =>
  x !== null &&
  typeof x === "object" &&
  !Array.isArray(x);

const text = (x, max) =>
  typeof x === "string" &&
  x.trim().length > 0 &&
  x.length <= max;

const sortText = (a, b) => a.localeCompare(b);

export function normalizeTime(input) {
  if (typeof input !== "string") {
    throw Error("ISO timestamp string required");
  }

  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/
      .exec(input);

  if (!m) {
    throw Error(
      "Strict ISO timestamp with explicit timezone required"
    );
  }

  const [y, mo, d, h, mi, s] =
    m.slice(1, 7).map(Number);

  const frac =
    Number((m[7] || "").padEnd(3, "0"));

  const oh = Number(m[10] || 0);
  const om = Number(m[11] || 0);

  if (
    y < 1 ||
    mo < 1 || mo > 12 ||
    h > 23 || mi > 59 || s > 59 ||
    oh > 23 || om > 59
  ) {
    throw Error("Invalid timestamp components");
  }

  const leap =
    y % 4 === 0 &&
    (y % 100 !== 0 || y % 400 === 0);

  const days = [
    31, leap ? 29 : 28, 31, 30,
    31, 30, 31, 31, 30, 31, 30, 31
  ];

  if (d < 1 || d > days[mo - 1]) {
    throw Error("Nonexistent calendar date");
  }

  const dt = new Date(0);

  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, s, frac);

  const sign = m[9] === "-" ? -1 : 1;

  const offset =
    m[8] === "Z"
      ? 0
      : sign * (oh * 60 + om);

  const out = new Date(
    dt.getTime() - offset * 60000
  );

  if (!Number.isFinite(out.getTime())) {
    throw Error("Unrepresentable timestamp");
  }

  return out.toISOString().replace(".000Z", "Z");
}

export function reviewCase(doc) {
  if (
    !record(doc) ||
    !text(doc.case_id, 200)
  ) {
    throw Error("case_id required");
  }

  const { evidence, events, links } = doc;

  if (![evidence, events, links].every(Array.isArray)) {
    throw Error(
      "evidence/events/links must be arrays"
    );
  }

  if (
    evidence.length > 2000 ||
    events.length > 5000 ||
    links.length > 10000
  ) {
    throw Error(
      "Case exceeds interactive preview limits"
    );
  }

  const byId = new Map();

  for (const e of evidence) {
    if (
      !record(e) ||
      !text(e.id, 200) ||
      !text(e.source, 500)
    ) {
      throw Error("Evidence needs ID and source");
    }

    if (byId.has(e.id)) {
      throw Error("Duplicate evidence ID");
    }

    if (
      e.derived_from != null &&
      !text(e.derived_from, 200)
    ) {
      throw Error("Invalid derived_from");
    }

    if (
      e.sha256 != null &&
      (
        typeof e.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/i.test(e.sha256)
      )
    ) {
      throw Error("Invalid evidence SHA-256");
    }

    byId.set(e.id, e);
  }

  const roots = new Map();

  for (const id of byId.keys()) {
    if (roots.has(id)) continue;

    const path = [];
    const seen = new Set();

    let cur = id;

    while (!roots.has(cur)) {
      if (!byId.has(cur)) {
        throw Error("Unknown evidence parent");
      }

      if (seen.has(cur)) {
        throw Error("Derivation cycle");
      }

      seen.add(cur);
      path.push(cur);

      const parent = byId.get(cur).derived_from;

      if (!parent) break;

      cur = parent;
    }

    const origin = roots.get(cur) || cur;

    for (const step of path) {
      roots.set(step, origin);
    }
  }

  const eventIds = new Set();

  const timeline = events.map(e => {
    if (
      !record(e) ||
      !text(e.id, 200) ||
      eventIds.has(e.id)
    ) {
      throw Error("Invalid or duplicate event ID");
    }

    eventIds.add(e.id);

    if (
      !text(e.description, 4000) ||
      !Array.isArray(e.evidence_ids) ||
      e.evidence_ids.length < 1 ||
      e.evidence_ids.length > 2000 ||
      e.evidence_ids.some(id => !byId.has(id))
    ) {
      throw Error(
        "Event needs description and valid evidence IDs"
      );
    }

    return {
      id: e.id,
      timestamp_utc: normalizeTime(e.timestamp),
      description: e.description,
      evidence_ids: [...e.evidence_ids]
    };
  }).sort(
    (a, b) =>
      sortText(a.timestamp_utc, b.timestamp_utc) ||
      sortText(a.id, b.id)
  );

  for (const l of links) {
    if (
      !record(l) ||
      !RELATIONS.has(l.type) ||
      !byId.has(l.from) ||
      !byId.has(l.to) ||
      l.from === l.to
    ) {
      throw Error("Invalid evidence relationship");
    }
  }

  // Group by actual provenance roots,
  // never by matching source labels alone.
  const groups = new Map();

  for (const e of evidence) {
    const origin = roots.get(e.id);

    if (!groups.has(origin)) {
      groups.set(origin, []);
    }

    groups.get(origin).push(e.id);
  }

  const source_groups = [...groups]
    .map(([root_evidence_id, ids]) => ({
      root_evidence_id,
      source: byId.get(root_evidence_id).source,
      evidence_ids: ids.sort(sortText)
    }))
    .sort(
      (a, b) =>
        sortText(a.source, b.source) ||
        sortText(
          a.root_evidence_id,
          b.root_evidence_id
        )
    );

  return {
    schema: "evidenceforge.browser-review.v2",
    case_id: doc.case_id,
    timeline,
    evidence: evidence.map(e => ({ ...e })),
    links: links.map(l => ({ ...l })),
    contradictions: links
      .filter(l => l.type === "contradicts")
      .map(l => ({ ...l })),
    source_groups,
    cautions: [
      "Connections are evidence associations, not proof of identity or guilt.",
      "Contradictions are declared relationships requiring human review.",
      "Distinct provenance roots are not proof of statistical independence."
    ],
    generated_at_utc: new Date().toISOString()
  };
}
