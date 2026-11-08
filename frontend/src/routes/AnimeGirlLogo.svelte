<script lang="ts">
  import Fa from "svelte-fa";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import cheerUrl from "$lib/assets/cheer.webp";
</script>

<div class="hidden md:block absolute top-[-31px] right-[-44px] lg:right-4 pointer-events-none">
  <!-- 
    offset = padding 16px + border 1px = 17px
    imgWidth = parent top px - 17px
  -->
  <div class="absolute right-16 w-[79px]">
    <img width="79" src={cheerUrl} alt="anime girl cheer" />
  </div>
  <div class="absolute top-[-27px] right-[22px] opacity-85 text-blue-400">
    <Fa icon={faPuzzlePiece} rotate="213" size="4x" />
  </div>
  <div class="absolute top-[-33px] right-[113px] opacity-85 text-pink-400">
    <Fa icon={faPuzzlePiece} rotate="73" size="4x" />
  </div>
</div>
