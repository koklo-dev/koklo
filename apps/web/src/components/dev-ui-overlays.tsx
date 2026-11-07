"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  RadioCard,
  RadioCardGroup,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ToastProvider,
  useToast,
} from "@koklo/ui";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";
import { SHEET_SIZES } from "./dev-ui-overlays-data.ts";

function DialogFrame() {
  return (
    <DevUiFrame title="Dialog">
      <DevUiNote>520 au plus, rayon 14, voile flou, pied --surface</DevUiNote>
      <DevUiRow>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Ouvrir le dialogue</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau projet</DialogTitle>
              <DialogDescription>
                Le projet démarre par le dossier d'idée. Le dépôt de spec est créé en arrière-plan.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field>
                <FieldLabel htmlFor="dev-ov-name">Nom du projet</FieldLabel>
                <Input id="dev-ov-name" defaultValue="Atelier neuf" />
              </Field>
              <Field>
                <FieldLabel htmlFor="dev-ov-client" optional>
                  Client
                </FieldLabel>
                <Input id="dev-ov-client" placeholder="nom@entreprise.fr" />
                <FieldDescription>
                  Il recevra une invitation pour écrire l'idée avec vous.
                </FieldDescription>
              </Field>
              <div className="flex flex-col gap-2">
                <span id="dev-ov-structure" className="text-meta font-semibold">
                  Structure du dossier d'idée
                </span>
                <RadioCardGroup
                  aria-labelledby="dev-ov-structure"
                  defaultValue="default"
                  className="grid-cols-1"
                >
                  <RadioCard
                    value="default"
                    title="Cadrage par défaut"
                    description="10 pages : vision, problème, utilisateurs, périmètre… Modifiable ensuite."
                  />
                  <RadioCard
                    value="empty"
                    title="Dossier vide"
                    description="Vous créez vos pages vous-même."
                  />
                </RadioCardGroup>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Créer le projet</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DevUiRow>
    </DevUiFrame>
  );
}

function AlertDialogFrame() {
  return (
    <DevUiFrame title="AlertDialog">
      <DevUiNote>Focus initial sur Annuler, le voile ne ferme pas</DevUiNote>
      <DevUiRow>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Ouvrir le dialogue d'alerte</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader icon="warning">
              <AlertDialogTitle>Supprimer le projet ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le dossier d'idée et ses pages seront supprimés. Cette action est définitive.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction>Supprimer le projet</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DevUiRow>
    </DevUiFrame>
  );
}

function SheetFrame() {
  return (
    <DevUiFrame title="Sheet">
      <DevUiNote>Trois tailles : 440, 540 et 620 ; plein écran sous 640</DevUiNote>
      <DevUiRow>
        {SHEET_SIZES.map(({ size, label }) => (
          <Sheet key={size}>
            <SheetTrigger asChild>
              <Button variant="outline">{label}</Button>
            </SheetTrigger>
            <SheetContent size={size}>
              <SheetHeader icon="description" tag="F-012">
                <SheetTitle>Plafond mensuel</SheetTitle>
                <SheetDescription>Tiroir {label.toLowerCase()}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                <Field>
                  <FieldLabel htmlFor={`dev-ov-sheet-${size}`}>Montant</FieldLabel>
                  <Input id={`dev-ov-sheet-${size}`} defaultValue="100 €" />
                </Field>
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="outline">Annuler</Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button>Enregistrer</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </DevUiRow>
    </DevUiFrame>
  );
}

function ToastButtons() {
  const { toast } = useToast();
  return (
    <DevUiRow>
      <Button variant="outline" onClick={() => toast({ tone: "success", title: "Projet créé" })}>
        Toast de succès
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast({
            tone: "error",
            title: "L'envoi a échoué",
            action: { label: "Annuler", onClick: () => undefined },
          })
        }
      >
        Toast d'erreur
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast({
            tone: "info",
            title: "Synchronisation en cours",
            action: { label: "OK", onClick: () => undefined },
          })
        }
      >
        Toast d'information
      </Button>
    </DevUiRow>
  );
}

function ToastFrame() {
  return (
    <DevUiFrame title="Toast">
      <DevUiNote>
        En bas au centre, annoncé en polite (erreur : assertive), F8 va à la région
      </DevUiNote>
      <ToastButtons />
    </DevUiFrame>
  );
}

/** Section « Superpositions · B » : dialogues, tiroirs et toasts ouverts par bouton (S-dev-ui, TK-139). */
export function DevUiSurfacesB() {
  return (
    <ToastProvider>
      <DevUiSection id="dev-ui-surf-b" title="Superpositions · B : dialogues, tiroirs et toasts">
        <DialogFrame />
        <AlertDialogFrame />
        <SheetFrame />
        <ToastFrame />
      </DevUiSection>
    </ToastProvider>
  );
}
