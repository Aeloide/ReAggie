<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount } from "svelte";
  import { driver } from "driver.js";
  import "$lib/room/help.postcss";
  import controlsUrl from "$lib/assets/help/controls.webm";
  import cameraUrl from "$lib/assets/help/camera.webm";
  import selectionUrl from "$lib/assets/help/selection.webm";
  import spreadUrl from "$lib/assets/help/spread.webm";
  import chpicHi from "$lib/assets/help/chpic-hi.webp";
  import chpicLetsGo from "$lib/assets/help/chpic-letsgo.webp";
  import { chatInput } from "./side-panel/chatInputStore";
  import { settings } from "./stores";
  import { modalBodyEvents } from "$lib/directives";

  function getVideoHtml(url: string) {
    if (url.endsWith(".webm")) {
      return `<video src='${url}' autoplay loop></video>`;
    }

    return `<img src='${url}' />`;
  }

  function getContent(text: string | string[], mediaUrl?: string) {
    let resHtml = "";

    if (text.length > 0) {
      if (typeof text === "string") {
        resHtml += `<p>${text}</p>`;
      } else {
        resHtml += "<ul class='list'>";
        for (let i = 0; i < text.length; i++) {
          resHtml += `<li><span>${text[i]}</span></li>`;
        }
        resHtml += "</ul>";
      }
    }

    if (mediaUrl) {
      if (resHtml.length > 0) {
        resHtml += "<hr class='my-2' />";
      }
      resHtml += `<div class="flex justify-center">${getVideoHtml(mediaUrl)}</div>`;
    }

    return resHtml;
  }

  const driverObj = driver({
    showProgress: true,
    nextBtnText: t("tour.next", $translations),
    prevBtnText: t("tour.prev", $translations),
    doneBtnText: t("tour.done", $translations),
    progressText: t("tour.progress", $translations),
    onPopoverRender: (popover) => {
      modalBodyEvents(popover.wrapper);
    },
    onDestroyed: () => {
      settings.update((s) => {
        s.helpDismissed = "yes";
        return s;
      });
    },
    steps: [
      {
        popover: {
          title: t("tour.welcome", $translations),
          description: getContent([], chpicHi),
        },
      },
      {
        popover: {
          title: t("tour.camera", $translations),
          description: getContent(
            [
              t("tour.camera1", $translations),
              t("tour.camera2", $translations),
            ],
            cameraUrl,
          ),
        },
      },
      {
        popover: {
          title: t("tour.controls", $translations),
          description: getContent([t("tour.controls1", $translations)], controlsUrl),
        },
      },
      {
        popover: {
          title: t("tour.selection", $translations),
          description: getContent(
            [
              t("tour.selection1", $translations),
              t("tour.selection2", $translations),
            ],
            selectionUrl,
          ),
        },
      },
      {
        popover: {
          title: t("tour.spread", $translations),
          description: getContent(
            [
              t("tour.spread1", $translations),
              t("tour.spread2", $translations),
              t("tour.spread3", $translations),
            ],
            spreadUrl,
          ),
        },
      },
      {
        element: "#users-list",
        popover: {
          title: t("tour.usersList", $translations),
          description: getContent(t("tour.usersListText", $translations)),
          side: "left",
          align: "start",
        },
      },
      {
        element: "#chat-input",
        popover: {
          title: t("tour.chatInput", $translations),
          description: getContent([
            t("tour.chatInput1", $translations),
            t("tour.chatInput2", $translations),
          ]),
          side: "left",
          align: "start",
        },
        onHighlightStarted: () => {
          chatInput.setVisible(true);
        },
        onDeselected: () => {
          chatInput.setVisible(false);
        },
      },
      {
        element: "#room-menu",
        popover: {
          title: t("tour.roomMenu", $translations),
          description: getContent([t("tour.roomMenuText", $translations)]),
          side: "bottom",
          align: "start",
        },
      },
      {
        popover: {
          title: t("tour.play", $translations),
          description: getContent([t("tour.goodLuck", $translations)], chpicLetsGo),
        },
      },
    ],
  });

  onMount(() => {
    driverObj.drive();

    return () => {
      driverObj.destroy();
    };
  });
</script>
