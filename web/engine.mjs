const relations = new Set([
  "observed_on", "references", "transferred_to",
  "derived_from", "corroborates", "contradicts"
]);

export function normalizeTime(input) {
  if (typeof input !== "string")
    throw Error("ISO timestamp string required");

  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(input);
  if (!m)
    throw Error("Strict ISO timestamp with explicit timezone required");

  const [year, month, day, hour, minute, second] =
    [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);

  const frac = Number((m[7] || "").padEnd(3, "0"));
  const offsetHour = Number(m[10] || 0);
  const offsetMinute = Number(m[11] || 0);

  if (year < 1 || month < 1 || month > 12 ||
      hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 23 || offsetMinute > 59)
    throw Error("Invalid timestamp components");

  const leap = year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);

  const days = [31, leap ? 29 : 28, 31, 30, 31, 30,
                31, 31, 30, 31, 30, 31];

  if (day < 1 || day > days[month - 1])
    throw Error("Nonexistent calendar date");

  const dt = new Date(0);
  dt.setUTCFullYear(year, month - 1, day);
  dt.setUTCHours(hour, minute, second, frac);

  const sign = m[9] === "-" ? -1 : 1;
  const offset = m[8] === "Z" ? 0 :
    sign * (offsetHour * 60 + offsetMinute);

  const utc = new Date(dt.getTime() - offset * 60000);
  if (!Number.isFinite(utc.getTime()))
    throw Error("Unrepresentable timestamp");

  return utc.toISOString().replace(".000Z", "Z");
}

export function reviewCase(doc) {
  if (!doc || typeof doc !== "object" ||
      Array.isArray(doc) ||
      typeof doc.case_id !== "string" ||
      !doc.case_id.trim())
    throw Error("case_id required");

  const {evidence, events, links} = doc;
  if (![evidence, events, links].every(Array.isArray))
    throw Error("evidence/events/links must be arrays");

  if (evidence.length > 2000 ||
      events.length > 5000 ||
      links.length > 10000)
    throw Error("Case exceeds interactive preview limits");

  if (doc.case_id.length > 200)
    throw Error("Case ID too long");

  const byId = new Map();

  for (const item of evidence) {
    if (!item || typeof item.id !== "string" ||
        !item.id.trim() || typeof item.source !== "string" ||
        !item.source.trim())
      throw Error("Evidence needs ID and source");

    if (item.id.length > 200 || item.source.length > 500)
      throw Error("Evidence field too long");

    if (byId.has(item.id))
      throw Error("Duplicate evidence ID");

    if (item.derived_from != null &&
        typeof item.derived_from !== "string")
      throw Error("Invalid derived_from");

    if (item.sha256 != null &&
        (typeof item.sha256 !== "string" ||
         !/^[a-fA-F0-9]{64}$/.test(item.sha256)))
      throw Error("Invalid evidence SHA-256");

    byId.set(item.id, item);
  }

  for (const item of evidence) {
    if (item.derived_from != null &&
        !byId.has(item.derived_from))
      throw Error("Unknown evidence parent");

    let cur = item;
    const visited = new Set();
    while (cur) {
      if (visited.has(cur.id))
        throw Error("Derivation cycle");
      visited.add(cur.id);
      cur = cur.derived_from ? byId.get(cur.derived_from) : null;
    }
  }

  const eventIDs = new Set();
  const timeline = events.map(item => {
    if (!item || typeof item.id !== "string" ||
        !item.id.trim() || eventIDs.has(item.id))
      throw Error("Invalid or duplicate event ID");

    eventIDs.add(item.id);

    if (typeof item.description !== "string" ||
        item.description.length > 4000 ||
        !Array.isArray(item.evidence_ids) ||
        !item.evidence_ids.length ||
        item.evidence_ids.length > 2000 ||
        item.evidence_ids.some(id => !byId.has(id)))
      throw Error("Event needs description and valid evidence IDs");

    return {
      id: item.id,
      timestamp_utc: normalizeTime(item.timestamp),
      description: item.description,
      evidence_ids: [...item.evidence_ids]
    };
  }).sort((a, b) =>
    a.timestamp_utc.localeCompare(b.timestamp_utc) ||
    a.id.localeCompare(b.id)
  );

  for (const l of links) {
    if (!l || !relations.has(l.type) ||
        !byId.has(l.from) || !byId.has(l.to) ||
        l.from === l.to)
      throw Error("Invalid evidence relationship");
  }

  const groups = new Map();
  for (const item of evidence) {
    let root = item;
    while (root.derived_from)
      root = byId.get(root.derived_from);

    const key = root.source;
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key).push(item.id);
  }

  const sortedGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, ids]) => ({
      source,
      evidence_ids: ids.sort()
    }));

  return {
    schema: "evidenceforge.browser-review.v1",
    case_id: doc.case_id,
    timeline,
    evidence: [...evidence],
    links: [...links],
    contradictions: links.filter(l => l.type === "contradicts"),
    source_groups: sortedGroups,
    cautions: [
      "Connections are evidence associations, not proof of identity or guilt.",
      "Contradictions are declared relationships requiring human review.",
      "Independence depends on supplied provenance; copied records may not corroborate one another."
    ],
    generated_at_utc: new Date().toISOString()
  };
}
