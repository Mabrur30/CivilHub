import {
  BridgeIcon,
  BuildingsIcon,
  DropIcon,
  HammerIcon,
  HouseIcon,
  type Icon,
  type IconProps,
  RoadHorizonIcon,
  ShovelIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";

const icons: Record<string, Icon> = {
  Residential: HouseIcon,
  Commercial: BuildingsIcon,
  Renovation: HammerIcon,
  "Roads & transport": RoadHorizonIcon,
  "Water & drainage": DropIcon,
  Infrastructure: BridgeIcon,
  "Land development": ShovelIcon,
};

/** The icon for a project category, with a generic one for older briefs. */
export function CategoryIcon({
  category,
  ...props
}: IconProps & { category: string }): ReactElement {
  const Glyph = icons[category] ?? WrenchIcon;
  return <Glyph aria-hidden="true" {...props} />;
}
