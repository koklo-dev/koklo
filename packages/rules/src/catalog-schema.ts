import { z } from "zod";
import type { Catalog, Enforcement, Profile, Rule } from "./catalog-types.ts";

// Squelette Red : les schémas rejettent tout. Le Green les remplace.
const never = <T>() => z.never() as unknown as z.ZodType<T>;

export const enforcementSchema = never<Enforcement>();
export const profileSchema = never<Profile>();
export const ruleSchema = never<Rule>();
export const catalogSchema = never<Catalog>();
