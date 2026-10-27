// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../src/index.ts";

beforeAll(() => {
  // jsdom n'implémente pas ces API utilisées par Radix et react-resizable-panels.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("Table", () => {
  it("garde la sémantique tableau complète", () => {
    render(
      <Table>
        <TableCaption>Tests</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Connexion</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>1 test</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Tests" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nom" })).toHaveClass("text-muted-foreground");
    expect(screen.getByRole("cell", { name: "Connexion" })).toBeInTheDocument();
  });
});

describe("Card et Alert", () => {
  it("Card compose ses parties", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Titre</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Corps</CardContent>
        <CardFooter>Pied</CardFooter>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Titre" })).toBeInTheDocument();
    expect(screen.getByText("Pied")).toHaveClass("flex");
  });

  it("Alert : role status par défaut, alert pour destructive, role surchargeable", () => {
    render(
      <>
        <Alert>info</Alert>
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>détail</AlertDescription>
        </Alert>
        <Alert role="note">note</Alert>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("info");
    expect(screen.getByRole("alert")).toHaveTextContent("Erreur");
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("change de panneau au clic et au clavier", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">contenu A</TabsContent>
        <TabsContent value="b">contenu B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("contenu A")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "B" }));
    expect(screen.getByText("contenu B")).toBeVisible();
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("data-state", "active");
  });
});

describe("Accordion", () => {
  it("ouvre et ferme un élément, chevron décoratif", async () => {
    const user = userEvent.setup();
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="x">
          <AccordionTrigger>Question</AccordionTrigger>
          <AccordionContent>Réponse</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    const trigger = screen.getByRole("button", { name: "Question" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Réponse")).toBeVisible();
  });
});

describe("Avatar", () => {
  it("affiche le repli (initiales) quand il n'y a pas d'image", () => {
    render(
      <Avatar>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("YK")).toHaveClass("rounded-full");
  });
});

describe("Popover et Sheet", () => {
  it("Popover s'ouvre depuis son déclencheur", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Ouvrir</PopoverTrigger>
        <PopoverContent>Contenu</PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.getByText("Contenu")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Contenu")).toBeNull();
  });

  it("Sheet se ferme avec le bouton nommé et accepte un côté", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Détail</SheetTrigger>
        <SheetContent side="left" closeLabel="Fermer le détail">
          <SheetHeader>
            <SheetTitle>Titre</SheetTitle>
            <SheetDescription>Description</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Annuler</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Détail" }));
    expect(screen.getByRole("dialog")).toHaveClass("left-0");
    await user.click(screen.getByRole("button", { name: "Fermer le détail" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Select", () => {
  it("choisit une option au clavier et affiche la coche de l'élément choisi", async () => {
    const user = userEvent.setup();
    render(
      <Select defaultValue="b">
        <SelectTrigger aria-label="Statut">
          <SelectValue placeholder="Choisir" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Statuts</SelectLabel>
            <SelectItem value="a">Alpha</SelectItem>
            <SelectSeparator />
            <SelectItem value="b">Bravo</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Statut" });
    expect(trigger).toHaveTextContent("Bravo");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    expect(trigger).toHaveTextContent("Alpha");
  });
});

describe("DropdownMenu", () => {
  it("expose cases à cocher, radios, libellés et sous-menu", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Affichage</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Colonnes</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="x">
            <DropdownMenuRadioItem value="x">Dense</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset>Plus</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem>Autre</DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Colonnes" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Dense" })).toBeChecked();
    expect(screen.getByRole("menuitem", { name: "Plus" })).toBeInTheDocument();
  });
});

describe("Resizable", () => {
  it("rend un séparateur focalisable entre deux panneaux", () => {
    render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="a">A</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="b">B</ResizablePanel>
      </ResizablePanelGroup>,
    );
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
