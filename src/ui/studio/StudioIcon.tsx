export type StudioIconName =
  | "audio-off"
  | "chevron-left"
  | "chevron-right"
  | "harmony"
  | "library"
  | "next"
  | "play"
  | "previous"
  | "redo"
  | "stop"
  | "undo";

export type StudioIconProps = Readonly<{
  name: StudioIconName;
}>;

export function StudioIcon({ name }: StudioIconProps) {
  if (name === "audio-off") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" />
        <path d="m16 9 5 5m0-5-5 5" />
      </svg>
    );
  }

  if (name === "chevron-left") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 6-6 6 6 6" />
      </svg>
    );
  }

  if (name === "chevron-right") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9.5 6 6 6-6 6" />
      </svg>
    );
  }

  if (name === "harmony") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="9" r="4.5" />
        <circle cx="15" cy="15" r="4.5" />
      </svg>
    );
  }

  if (name === "library") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h4v15H5zM10.5 4.5h4v15h-4zM16 6l3.5-1 2.5 13.5-3.5 1z" />
      </svg>
    );
  }

  if (name === "previous") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5v14M18 6l-8 6 8 6V6Z" />
      </svg>
    );
  }

  if (name === "next") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 5v14M6 6l8 6-8 6V6Z" />
      </svg>
    );
  }

  if (name === "play") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 5 11 7-11 7V5Z" />
      </svg>
    );
  }

  if (name === "stop") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    );
  }


  if (name === "undo") {
    return (
      <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8H4V4M4.5 8a8 8 0 1 1 .4 8.7" />
      </svg>
    );
  }

  return (
    <svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 8h4V4m-.5 4a8 8 0 1 0-.4 8.7" />
    </svg>
  );
}
