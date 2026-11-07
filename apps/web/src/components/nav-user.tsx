"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  useShell,
} from "@koklo/ui";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client.ts";
import { endFeatureSession } from "../lib/feature-draft.ts";
import { initialsOf } from "./sidebar-organization.tsx";

/** Identité du pied de la barre (avatar, nom, e-mail) et menu de déconnexion. Le thème a son propre bouton. */
export function NavUser() {
  const { collapsed, mobile } = useShell();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  if (!user) return null;

  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        {user.image ? <AvatarImage src={user.image} alt="" /> : null}
        <AvatarFallback className="rounded-lg bg-secondary text-caption font-medium text-secondary-foreground">
          {initialsOf(user.name)}
        </AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-meta font-medium">{user.name}</span>
          <span className="truncate text-caption text-muted-foreground">{user.email}</span>
        </span>
      )}
    </>
  );

  async function signOut(): Promise<void> {
    endFeatureSession();
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          {identity}
          {/* Nom accessible = texte visible + libellé (WCAG 2.5.3 « Label in Name »), sans aria-label qui le remplacerait. */}
          <span className="sr-only">Menu utilisateur</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={mobile ? "top" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-secondary text-caption font-medium text-secondary-foreground">
                {initialsOf(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <Icon name="logout" size={20} />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
