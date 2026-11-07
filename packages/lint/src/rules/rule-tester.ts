import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

RuleTester.describe = describe;
RuleTester.it = it;

/** Rules parse plugin modules, so every case is a module. */
export const tester = new RuleTester({ languageOptions: { sourceType: "module" } });
