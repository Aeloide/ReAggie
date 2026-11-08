<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Header from "../Header.svelte";
  import Copiable from "./Copiable.svelte"; // Assuming this component can accept a 'class' prop or has its own nice styling.
                                          // The classes I add are suggestive for how it could look.
</script>

<svelte:head>
  <title>{t("rules.title", $translations)}</title>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

<div class="bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-800 dark:text-slate-200">
  <Header />

  <section class="container mx-auto max-w-4xl py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
    <div class="text-center mb-10 sm:mb-12">
      <h1 class="text-4xl sm:text-5xl font-extrabold text-slate-700 dark:text-slate-100 tracking-tight">
        {t("rules.platform", $translations)}
      </h1>
    </div>

    <div class="bg-white dark:bg-slate-800 shadow-xl rounded-lg overflow-hidden">
      <div class="p-6 sm:p-8 lg:p-10 space-y-8">
        
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400 mb-1">{t("rules.basically", $translations)}</h2>
          <hr class="border-t border-slate-200 dark:border-slate-700 my-4" />
          <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {t("rules.uploadIntro", $translations)}
          </p>
          <ul class="list-disc list-inside space-y-2 pl-4 mb-4 text-slate-600 dark:text-slate-300">
            <li>
              {t("rules.category1", $translations)} 
              <a href="https://www.japaneselawtranslation.go.jp/en/laws/view/2895/en" target="_blank" rel="noopener noreferrer" class="font-medium text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 hover:underline">
                {t("rules.law", $translations)}
              </a>.
              {t("rules.category1Note", $translations)}
            </li>
            <li>
              {t("rules.category2", $translations)}
            </li>
          </ul>
        </div>

        <div>
          <h2 class="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400 mb-1">{t("rules.reporting", $translations)}</h2>
          <hr class="border-t border-slate-200 dark:border-slate-700 my-4" />
          <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {t("rules.reportIntro", $translations)}
          </p>
          <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {t("rules.reportCases", $translations)}
          </p>
          <ul class="list-disc list-inside space-y-3 pl-4 mb-4 text-slate-600 dark:text-slate-300">
            <li>
              {t("rules.roomContains", $translations)}
              <ul class="list-['◦'] list-inside space-y-1.5 pl-5 mt-2 text-slate-500 dark:text-slate-400">
                <li>
                  {t("rules.cat1", $translations)} <Copiable class="font-mono bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-md text-sm inline-block hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-copy select-all">3131746989</Copiable>)
                </li>
                <li>
                  {t("rules.cat2", $translations)} 
                  <a href="mailto:jiggie-contact@proton.me" class="font-medium text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 hover:underline">
                    jiggie-contact@proton.me
                  </a>
                </li>
              </ul>
            </li>
            <li>
              {t("rules.vpn", $translations)}<Copiable class="font-mono bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-md text-sm inline-block hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-copy select-all">184594741</Copiable>)
            </li>
            <li>
              {t("rules.scripts", $translations)}<Copiable class="font-mono bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-md text-sm inline-block hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-copy select-all">3405689018</Copiable>)
            </li>
            <li>
              {t("rules.ban3", $translations)}<Copiable class="font-mono bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-md text-sm inline-block hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-copy select-all">literally anything else</Copiable>)
            </li>
          </ul>
          <p class="text-slate-600 dark:text-slate-300 leading-relaxed font-medium mt-6 mb-2">
            {t("rules.reportNot", $translations)}
          </p>
          <ul class="list-disc list-inside space-y-2 pl-4 mb-4 text-slate-600 dark:text-slate-300">
            <li>{t("rules.mean", $translations)}</li>
            <li>{t("rules.dislikeUser", $translations)}</li>
            <li>{t("rules.dislikeMusic", $translations)}</li>
            <li>{t("rules.dislikePuzzle", $translations)}</li>
            <li>
              {t("rules.grief", $translations)}
            </li>
            <li class="text-rose-500 dark:text-rose-400">
              {t("rules.harsh", $translations)}
            </li>
          </ul>
        </div>

        <div>
          <h2 class="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400 mb-1">{t("rules.data", $translations)}</h2>
          <hr class="border-t border-slate-200 dark:border-slate-700 my-4" />
          <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {t("rules.dataIntro", $translations)}
          </p>
          
          <div class="space-y-3">
            <div>
              <h4 class="font-semibold text-slate-700 dark:text-slate-200">{t("rules.media", $translations)}</h4>
              <ul class="list-disc list-inside space-y-1 pl-4 mt-1 text-slate-500 dark:text-slate-400">
                <li>{t("rules.mediaPurge", $translations)}</li>
                <li>{t("rules.jukebox", $translations)}</li>
              </ul>
            </div>
            <div>
              <h4 class="font-semibold text-slate-700 dark:text-slate-200">{t("rules.ip", $translations)}</h4>
              <ul class="list-disc list-inside space-y-1 pl-4 mt-1 text-slate-500 dark:text-slate-400">
                <li>{t("rules.ipRoom", $translations)}</li>
                <li>{t("rules.ipReport", $translations)}</li>
                <li>{t("rules.ipAntiAbuse", $translations)}</li>
                <li>{t("rules.ipLog", $translations)}</li>
              </ul>
            </div>
            <div>
              <h4 class="font-semibold text-slate-700 dark:text-slate-200">{t("rules.nickname", $translations)}</h4>
              <ul class="list-disc list-inside space-y-1 pl-4 mt-1 text-slate-500 dark:text-slate-400">
                <li>{t("rules.nicknameCollected", $translations)}</li>
              </ul>
            </div>
            <div>
              <h4 class="font-semibold text-slate-700 dark:text-slate-200">{t("rules.messages", $translations)}</h4>
              <ul class="list-disc list-inside space-y-1 pl-4 mt-1 text-slate-500 dark:text-slate-400">
                <li>{t("rules.messagesCollected", $translations)}</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400 mb-1">{t("rules.thirdParties", $translations)}</h2>
          <hr class="border-t border-slate-200 dark:border-slate-700 my-4" />
          <ul class="list-disc list-inside space-y-2 pl-4 text-slate-600 dark:text-slate-300">
            <li>
              {t("rules.thirdPartyText", $translations)}
            </li>
          </ul>
        </div>

      </div>
    </div>
  </section>

  <footer class="text-center py-8">
    <p class="text-sm text-slate-500 dark:text-slate-400">{t("rules.mediaFooter", $translations)}</p>
  </footer>
</div>