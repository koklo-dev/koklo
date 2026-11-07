import { redirect } from "next/navigation";
import { settingsPath } from "../../../lib/shell-routes.ts";

/** `/settings` ouvre la première section. */
export default function Page(): never {
  redirect(settingsPath("members"));
}
