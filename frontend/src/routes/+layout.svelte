<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import "../app.postcss";
  import { fetchBanMessage } from "./notice/api";
  import { Toaster } from "$lib/components/ui/sonner";
  import { isMobileQuery } from "$lib/utils";
  import { onMount } from "svelte";
  import { updateBackground } from "./atlas";
import { initI18n } from "$lib/i18n";

  if ($page.url.pathname != "/notice") {
    const isBanned = fetchBanMessage();
    isBanned.then(async (v) => {
      if (v.offense) await goto("/notice");
    });
  }

  const isOctober = new Date().getMonth() == 9;
  const isDecember = new Date().getMonth() == 11;

  onMount(() => {
      void initI18n();
    if (!isOctober && !isDecember) updateBackground();
    else if (isOctober) {
      const bg = document.querySelector(".procbg")! as HTMLDivElement;
      bg.style.backgroundImage = `url('/Hallo_2025_noBG.png')`;
      bg.style.backgroundSize = "max(50vw, 50vh)";
    }
  });

  const isMobile = isMobileQuery();
</script>

<Toaster closeButton={$isMobile} />

<main class="size-full">
  <slot />
</main>
