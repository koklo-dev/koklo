/** Squelette du chargement : décoratif, il ne pulse que si le mouvement est permis. */
export function FramingSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="h-8 w-1/2 rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="h-28 rounded-md bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
