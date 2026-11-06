import { vi } from "vitest";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/**
 * `IntersectionObserver` simulé (jsdom n'en a pas) : `intersect("end" | "start")` déclenche l'observateur de la
 * sentinelle visée de `VirtualList`. Même principe que `packages/ui/test/helpers/virtual.ts`.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: Callback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
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
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}
