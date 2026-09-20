import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // The client's pure logic (src/lib) is tested too; components and hooks are not.
    include: ["server/**/*.test.ts", "src/lib/**/*.test.ts"],
  },
})
