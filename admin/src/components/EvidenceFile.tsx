import { FileTextIcon, MapPinIcon, WarningIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { type EvidenceFileView } from "../lib/api";
import { formatDateTime } from "../lib/format";

/**
 * A photo or document offered as evidence, with what CivilHub knows about
 * it: who uploaded it and when, when and where the camera says it was taken,
 * and any warnings. Camera data is a hint, not proof.
 */
export function EvidenceFile({ file, label }: { file: EvidenceFileView; label: string }): ReactElement {
  const facts = [
    file.takenAt ? `Taken ${formatDateTime(file.takenAt)}` : null,
    file.uploadedAt ? `Uploaded ${formatDateTime(file.uploadedAt)}${file.uploadedByLabel ? ` by ${file.uploadedByLabel}` : ""}` : null,
    file.camera,
  ].filter((part): part is string => Boolean(part));

  return (
    <figure className="grid gap-1.5">
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-white/10 hover:border-primary"
      >
        {file.isImage ? (
          <img src={file.url} alt={label} className="aspect-square w-full bg-void object-cover" loading="lazy" />
        ) : (
          <span className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-void p-2 text-center text-xs text-white/70">
            <FileTextIcon className="h-6 w-6" aria-hidden="true" />
            {file.name ?? "Document"}
          </span>
        )}
      </a>
      <figcaption className="grid gap-1 text-[11px] leading-4 text-white/50">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
        {file.location ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${file.location.lat}&mlon=${file.location.lng}#map=17/${file.location.lat}/${file.location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:text-glow"
          >
            <MapPinIcon className="h-3 w-3" aria-hidden="true" />
            Where it was taken
          </a>
        ) : null}
        {(file.flags ?? []).map((flag) => (
          <span key={flag} className="inline-flex items-start gap-1 rounded-md bg-amber-300/10 px-1.5 py-1 text-amber-100">
            <WarningIcon className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            {flag}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
