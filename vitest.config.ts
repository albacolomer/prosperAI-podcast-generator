import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // The client's `@/` alias, for the src/lib modules that import client data at runtime.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // The client's pure logic (src/lib) is tested too; components and hooks are not.
    include: ["server/**/*.test.ts", "src/lib/**/*.test.ts"],
  },
})
