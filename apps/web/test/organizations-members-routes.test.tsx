import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MembersLayout from "../src/app/members/layout.tsx";
import MembersRoute, { metadata as membersMetadata } from "../src/app/members/page.tsx";
import OrganizationsRoute, {
  metadata as organizationsMetadata,
} from "../src/app/organizations/page.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/members",
}));
vi.mock("../src/components/members-page.tsx", () => ({ MembersPage: () => <p>membres</p> }));
vi.mock("../src/components/organizations-page.tsx", () => ({
  OrganizationsPage: () => <p>organisations</p>,
}));
vi.mock("../src/components/app-sidebar.tsx", () => ({ AppSidebar: () => <nav>sidebar</nav> }));

describe("routes /members et /organizations", () => {
  it("/members : titre de page, composition de MembersPage dans le gabarit, fil d'Ariane « Membres »", () => {
    expect(membersMetadata.title).toBe("Membres · Koklo");
    render(
      <MembersLayout>
        <MembersRoute />
      </MembersLayout>,
    );
    expect(screen.getByText("membres")).toBeInTheDocument();
    expect(screen.getByText("Membres", { selector: "[aria-current=page]" })).toBeInTheDocument();
  });

  it("/organizations : titre de page et composition d'OrganizationsPage hors gabarit sidebar", () => {
    expect(organizationsMetadata.title).toBe("Organisations · Koklo");
    render(<OrganizationsRoute />);
    expect(screen.getByText("organisations")).toBeInTheDocument();
    expect(screen.queryByText("sidebar")).not.toBeInTheDocument();
  });
});
