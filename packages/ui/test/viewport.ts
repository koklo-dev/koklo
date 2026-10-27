/** Simule une largeur de fenêtre (innerWidth + matchMedia sur `max-width` / `min-width`). */
export function setViewport(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query)?.[1];
    const min = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query)?.[1];
    const matches =
      (max === undefined || width <= Number(max)) && (min === undefined || width >= Number(min));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

export const DESKTOP = 1280;
export const MOBILE = 500;
