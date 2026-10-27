/**
 * The one look of every form control — input, textarea, native select, and select triggers:
 * 36px high, card background, a border that firms up on hover, a soft focus ring, and the
 * error state through aria-invalid. Colors come from theme tokens only.
 */
export const FIELD =
  "h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground shadow-(--shadow-card) transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/70 hover:border-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
