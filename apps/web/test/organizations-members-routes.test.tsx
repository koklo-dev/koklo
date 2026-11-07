import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrganizationsRoute, {
  metadata as organizationsMetadata,
} from "../src/app/organizations/page.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/members",
}));
vi.mock("../src/components/organizations-page.tsx", () => ({
  OrganizationsPage: () => <p>organisations</p>,
}));
vi.mock("../src/components/app-sidebar.tsx", () => ({ AppSidebar: () => <nav>sidebar</nav> }));

describe("route /organizations", () => {
  it("/organizations : titre de page et composition d'OrganizationsPage hors gabarit sidebar", () => {
    expect(organizationsMetadata.title).toBe("Organisations · Koklo");
    render(<OrganizationsRoute />);
    expect(screen.getByText("organisations")).toBeInTheDocument();
    expect(screen.queryByText("sidebar")).not.toBeInTheDocument();
  });
});
