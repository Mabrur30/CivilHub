import { type ReactElement } from "react";
import {
  type ProjectCategoryCriteria,
  type ProjectRequirements,
  formatRequirement,
  groupFields,
} from "../../lib/projectCriteria";

/** A brief's answers under the same headings the client filled them in. */
export function ProjectRequirementsList({
  criteria,
  requirements,
}: {
  criteria: ProjectCategoryCriteria;
  requirements: ProjectRequirements;
}): ReactElement | null {
  const groups = groupFields(criteria.fields)
    .map(({ group, fields }) => ({
      group,
      rows: fields
        .filter((field) => requirements[field.key] !== undefined)
        .map((field) => ({
          key: field.key,
          label: field.label,
          value: formatRequirement(field, requirements[field.key]),
        })),
    }))
    .filter((group) => group.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map(({ group, rows }) => (
        <section key={group} aria-label={group} className="grid content-start gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
            {group}
          </h3>
          <dl className="grid gap-2.5 text-sm">
            {rows.map((row) => (
              <div key={row.key} className="flex justify-between gap-4 border-b border-white/5 pb-2.5 last:border-b-0">
                <dt className="text-white/50">{row.label}</dt>
                <dd className="text-right font-semibold tabular-nums text-white/85">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
