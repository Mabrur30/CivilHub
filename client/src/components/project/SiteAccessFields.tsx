import { type ReactElement } from "react";
import { type ProjectCriteriaSpec } from "../../lib/projectCriteria";
import { ChoiceChips } from "./ChoiceChips";
import { type SiteFormValue } from "../../lib/projectForm";

/** Access, services on site and the papers the client already holds. */
export function SiteAccessFields({
  value,
  options,
  onChange,
}: {
  value: SiteFormValue;
  options: ProjectCriteriaSpec["siteOptions"];
  onChange: (patch: Partial<SiteFormValue>) => void;
}): ReactElement {
  return (
    <div className="grid gap-6">
      <ChoiceChips
        id="siteVehicleAccess"
        name="siteVehicleAccess"
        legend="Vehicle access"
        note="(optional)"
        hint="Whether trucks can deliver rod, cement and ready-mix to the plot."
        options={options.vehicleAccess}
        value={value.vehicleAccess}
        onChange={(vehicleAccess) => onChange({ vehicleAccess })}
      />
      <ChoiceChips
        multiple
        id="siteUtilities"
        name="siteUtilities"
        legend="Connections already at the site"
        options={options.utilities}
        value={value.utilities}
        onChange={(utilities) => onChange({ utilities })}
      />
      <ChoiceChips
        multiple
        id="siteDocuments"
        name="siteDocuments"
        legend="Documents you have"
        hint="Engineers price more accurately when they know what already exists."
        options={options.documentsAvailable}
        value={value.documentsAvailable}
        onChange={(documentsAvailable) => onChange({ documentsAvailable })}
      />
    </div>
  );
}
