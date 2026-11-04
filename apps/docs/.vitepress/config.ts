import { defineConfig } from "vitepress";

export default defineConfig({
  title: "EffectMC",
  description:
    "Design notes and plugin patterns for EffectMC, a Paper plugin framework built on Effect.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Design", link: "/design/overview" },
      { text: "Patterns", link: "/patterns/" },
      { text: "Reference", link: "/services-and-testing" },
    ],
    sidebar: [
      {
        text: "Design",
        items: [
          { text: "Overview", link: "/design/overview" },
          { text: "Architecture", link: "/design/architecture" },
          { text: "Threading model", link: "/design/threading" },
          { text: "Effect kernel", link: "/design/effect" },
          { text: "Commands", link: "/design/commands" },
          { text: "Events", link: "/design/events" },
          { text: "Integrations", link: "/design/integrations" },
          { text: "UI (deferred)", link: "/design/ui" },
          { text: "Roadmap", link: "/design/roadmap" },
          { text: "Decisions", link: "/design/decisions" },
        ],
      },
      {
        text: "Patterns",
        items: [
          { text: "Overview", link: "/patterns/" },
          { text: "Bootstrap", link: "/patterns/bootstrap" },
          { text: "Commands", link: "/patterns/commands" },
          { text: "Events", link: "/patterns/events" },
          { text: "PersistentDataContainer", link: "/patterns/pdc" },
          { text: "Axe bolt", link: "/patterns/axe-bolt" },
          { text: "/count on Postgres", link: "/patterns/count-postgres" },
          { text: "Services and Layers", link: "/patterns/services" },
          { text: "Offload and hop", link: "/patterns/offload" },
          { text: "Errors", link: "/patterns/errors" },
          { text: "Warps/homes sample", link: "/patterns/warps" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "Services and testing", link: "/services-and-testing" }],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: "local" },
  },
});
