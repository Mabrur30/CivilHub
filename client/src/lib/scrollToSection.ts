import type { NavigateFunction } from "react-router-dom";

/**
 * Scrolls to a landing-page section by id, routing back to "/" first when the
 * caller is on another page. Shared by the navbar and the footer so the two
 * cannot drift apart.
 *
 * The section ids this resolves ("home", "how-it-works", "for-engineers-clients",
 * "pricing", "testimonials") live on the landing sections themselves — renaming
 * one there means renaming it in both link lists.
 */
export function scrollToSection(
  targetId: string,
  pathname: string,
  navigate: NavigateFunction,
): void {
  const scroll = (): void => {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (pathname !== "/") {
    navigate("/");
    window.setTimeout(scroll, 50);
    return;
  }

  scroll();
}
