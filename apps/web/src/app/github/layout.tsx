import type { ReactNode } from "react";
import { AppFrame } from "../../components/app-frame.tsx";

export default function GithubLayout({ children }: { children: ReactNode }) {
  return <AppFrame current="GitHub">{children}</AppFrame>;
}
