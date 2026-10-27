import { createRoot } from "react-dom/client";
import {
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  StatusBadge,
} from "../../src/index.ts";

function Fixture() {
  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex gap-2">
        <StatusBadge status="validated" label="Validée" />
        <StatusBadge status="pending" label="À valider" />
        <StatusBadge status="revise" label="À revoir" />
      </div>
      <IconButton icon="search" aria-label="Rechercher" />
      <Sheet>
        <SheetTrigger>Ouvrir le panneau</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Panneau</SheetTitle>
            <SheetDescription>Contenu du panneau</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Select>
        <SelectTrigger aria-label="Choix" className="w-48">
          <SelectValue placeholder="Choisir" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Fixture />);
