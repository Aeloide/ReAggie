<script lang="ts">
  import { endStats } from "../stores";
  import { locale, t, translations } from "$lib/i18n";
  import Sparking from "./Sparking.svelte";

  function ordinal(number: number, lang: string) {
    return lang === "ru" ? String(number) : getOrdinalSuffix(number);
  }

  function getOrdinalSuffix(number: number) {
    const suffixes = ["th", "st", "nd", "rd"];
    const remainder = number % 100;

    // Check for exceptions in the range 11-13
    if (remainder >= 11 && remainder <= 13) {
      return number + suffixes[0];
    }

    // Determine suffix based on last digit
    const lastDigit = number % 10;
    const suffix = suffixes[lastDigit] || suffixes[0];

    return number + suffix;
  }

</script>

<div class="mainscreen">
  <div class="top3">
    {#if $endStats?.ranking.length >= 1}
      <div class="topentry">
        <Sparking rate={0.5}>
          <img data-gold src="/goldstatue.png" alt={ordinal(1, $locale)} />
        </Sparking>
        <div class="expl">
          <span>{t("post.place", $translations).replace("{ordinal}", ordinal(1, $locale))}</span>
          <span class="name">{$endStats.ranking[0][0]}</span>
          <span class="points">{t("post.points", $translations).replace("{count}", String($endStats.ranking[0][1]))}</span>
        </div>
      </div>
    {/if}
    {#if $endStats?.ranking.length >= 2}
      <div class="topentry">
        <Sparking rate={0.2}>
          <img data-silver src="/silverstatue.png" alt={ordinal(2, $locale)} />
        </Sparking>
        <div class="expl">
          <span>{t("post.place", $translations).replace("{ordinal}", ordinal(2, $locale))}</span>
          <span class="name">{$endStats.ranking[1][0]}</span>
          <span class="points">{t("post.points", $translations).replace("{count}", String($endStats.ranking[1][1]))}</span>
        </div>
      </div>
    {/if}
    {#if $endStats?.ranking.length >= 3}
      <div class="topentry">
        <Sparking rate={0.1}>
          <img data-bronze src="/bronzestatue.png" alt={ordinal(3, $locale)} />
        </Sparking>
        <div class="expl">
          <span>{t("post.place", $translations).replace("{ordinal}", ordinal(3, $locale))}</span>
          <span class="name">{$endStats.ranking[2][0]}</span>
          <span class="points">{t("post.points", $translations).replace("{count}", String($endStats.ranking[2][1]))}</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="content">
    <div class="remaining">
      {#each $endStats.ranking.slice(3) as entry, idx}
        <div class="ranking-entry">
          <span>{t("post.placeRow", $translations).replace("{ordinal}", ordinal(idx + 4, $locale))}</span>
          <span data-hl>{entry[0]} {t("post.pointsParen", $translations).replace("{count}", String(entry[1]))}</span>
        </div>
      {/each}
    </div>

    <div class="other-awards">
      {#if $endStats.jcfav}
        <div class="other-entry">
          <img data-kiss src="/kiss.gif" alt={t("post.jcFavorite", $translations)} />
          <div class="expl">
            <span>{t("post.jcFavorite", $translations)}</span>
            <span>{$endStats.jcfav}</span>
          </div>
        </div>
      {/if}
      {#if $endStats.deadweight}
        <div class="other-entry">
          <img data-cry src="/cry.gif" alt={t("post.deadweight", $translations)} />
          <div class="expl">
            <span>{t("post.deadweight", $translations)}</span>
            <span>{$endStats.deadweight}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style scoped>
  .mainscreen {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
    height: 100%;
  }

  .top3 {
    display: flex;
    justify-content: space-around;
    background-color: rgba(0, 0, 0, 0.75);
    border-radius: 2rem;
    padding: 1rem;
    width: 100%;
    margin-bottom: 1rem;
    backdrop-filter: blur(10px);
    overflow: hidden;
    pointer-events: all;
  }

  .topentry {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1rem;
    flex: 1 1 30%;
    text-align: center;
    justify-content: flex-end;
  }

  .topentry img {
    max-width: 100%;
    height: auto;
  }

  .expl {
    font-size: 1.5em;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .expl > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 15ch;
  }

  .expl > span.name {
    font-weight: bold;
  }

  .expl > span.points {
    margin-top: 0.5em;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .remaining {
    background-color: rgba(0, 0, 0, 0.75);
    border-radius: 2rem;
    padding: 1rem;
    backdrop-filter: blur(10px);
    overflow-y: auto;
    max-height: 30vh;
    font-size: 1.2em;
    pointer-events: all;
  }

  .ranking-entry {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ranking-entry span[data-hl] {
    font-weight: bold;
  }

  .other-awards {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }

  .other-entry {
    display: flex;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.75);
    border-radius: 2rem;
    padding: 1rem;
    backdrop-filter: blur(10px);
    flex: 1 1 45%;
    text-align: center;
  }

  .other-entry img {
    width: 80px;
    height: auto;
    margin-right: 1rem;
  }

  /* Responsive styles */
  @media (max-width: 768px) {
    .top3 {
      overflow-x: auto;
      flex-wrap: nowrap;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
    }

    .topentry {
      flex: 0 0 auto;
      scroll-snap-align: start;
      margin: 0.5rem;
      width: 80%;
    }

    .expl {
      font-size: 1.2em;
    }

    .expl > span {
      max-width: 14ch;
    }

    .other-entry {
      flex-direction: column;
      align-items: center;
    }

    .other-entry img {
      margin: 0 0 0.5rem 0;
    }
  }

  @media (max-width: 480px) {
    .expl > span {
      max-width: 12ch;
    }

    .ranking-entry {
      font-size: 1em;
    }

    .topentry {
      width: 90%;
    }
  }

  /* Hide scrollbar */
  .remaining::-webkit-scrollbar {
    display: none;
  }

  /* For Firefox */
  .remaining {
    scrollbar-width: none;
  }

  /* Optional: Hide scrollbar in other browsers */
  .remaining::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  img {
    image-rendering: pixelated;
  }

  img[data-gold] {
    width: 192px;
    height: auto;
  }
  img[data-silver] {
    width: 132px;
    height: auto;
  }

  img[data-bronze] {
    width: 84px;
    height: auto;
  }

  img[data-kiss] {
    width: 93px;
    height: 81px;
  }

  img[data-cry] {
    width: 84px;
    height: 81px;
  }
</style>
