import { vi } from "vitest";

/**
 * jsdom ne calcule aucune mise en page : le virtualiseur lit `offsetHeight` du conteneur défilant.
 * `mockViewport` fixe cette hauteur (px) pour toute la durée du test ; `restoreViewport` la rend.
 */
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");

export function mockViewport(height: number): void {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 600 });
}

export function restoreViewport(): void {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
  else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** `IntersectionObserver` simulé : `intersect(selector)` déclenche l'observateur de la sentinelle visée. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: Callback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
    // Le vrai observateur notifie l'état initial de la cible observée : ici, hors écran.
    this.callback([{ target: el, isIntersecting: false }]);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  static reset(): void {
    FakeIntersectionObserver.instances = [];
  }
  /** Notifie que la sentinelle `data-sentinel=<which>` est entrée dans la zone visible. */
  static intersect(which: "end" | "start"): void {
    for (const observer of FakeIntersectionObserver.instances) {
      for (const target of observer.targets) {
        if (target.getAttribute("data-sentinel") === which) {
          observer.callback([{ target, isIntersecting: true }]);
        }
      }
    }
  }
}

export function installIntersectionObserver(): void {
  FakeIntersectionObserver.reset();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}
