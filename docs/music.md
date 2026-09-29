# Music in the walk

Two kinds, both listed in `public/assets/music/tracks.json` and both streamed (`<audio>` elements), so nothing is
fetched until it is wanted. The player's **Music** slider (Options > Sound) sets both. `M` (mute) silences both.

| Kind | Code | What it does |
|---|---|---|
| **Pieces** | `src/audio/music.ts` | Quiet piano, one piece at a time in a shuffled order. The first swells in over 20 s after the walk begins, each fades out at its end, then 40–90 s of silence. It gives way to St Casimir's bells and to a place's own music. |
| **Zones** | `src/audio/zones.ts` | Music that belongs to a place. As the walker nears one of its `sites` the recording fades in (a smooth curve between `far` and `near` metres), panned towards the site and muffled with distance, as if from a courtyard or an upper window. Gone behind you; the stream pauses 12 s after you are out of earshot. |

`src/audio/manifest.ts` reads the list. Sites are metres east and south of the Town Hall (the map's x and z).

## The rule: free in Europe, not only in the US

The owner is in Europe, so a file is used only if it is free to use there: **the recording is over 70 years old or was
released to the public domain (CC0) by its performers, and the composer died over 70 years ago** (or the tune is
traditional). "Public domain in the US" is not enough (it is what the 100-year US rule gives to a 1924 record: the
tune may still be in copyright in Europe). Each file is listed in `CREDITS.md` with where it came from.
Checked and **refused** for this reason: Naftule Brandwein's 1924 Victor discs (US-only), and Joseph Moskowitz's
"Panama Pacific Drag" (1916; composer Leo Edwards died in 1978).

## What is in it now

- **Pieces:** three Chopin works by Musopen's performers (Op. 9 No. 2, Op. posth. 72 No. 1, Waltz Op. 69 No. 1). Chopin
  is the Polish-speaking city's composer. [U] that a walker of 1900 would hear him here; it is a design choice, made
  with the owner ("period-true").
- **The klezmer zone**, `jewish-quarter-west`: four dances by Harry Kandel's Orchestra (1921). It has two sites:
  one at the west edge of the walk (x −125, z −6: where Vokiečių g. meets Mėsinių g., the German Street and the
  edge of the Jewish quarter), one at the north edge (x 5, z −135, towards Stiklių g.). Loudest within 25 m of a
  site, gone beyond 95 m. From the square you hear nothing; on Vokiečių g. a hint; at the west edge, clearly.
  - The Jewish quarter began at the square's western edge (Vokiečių, Žydų, Stiklių, Mėsinių): see
    `docs/research/city-1900.md` §2 [U, design]. Yiddish was the native language of 40% of the city in 1897 [V], same file.
  - Klezmer as the music of Jewish weddings and streets in Eastern Europe [V, general history]:
    [Klezmer (Wikipedia)](https://en.wikipedia.org/wiki/Klezmer).
  - **[U]** that this band sounds like Vilna's. It is a New York band of 1921, two decades after the setting; the
    dances (bulgar, freylekhs) belong to the Eastern European tradition, and nothing ties these discs to Vilna.
    All the walk claims is that klezmer was heard in the Jewish quarter.
  - Harry Kandel (c. 1885–1943), clarinettist and bandleader, recorded for Victor 1916–1927
    ([Wikipedia](https://en.wikipedia.org/wiki/Harry_Kandel)). The Library of Congress credits him only as leader
    and arranger on these four sides: no composer, so traditional tunes. [U]: not checked against a catalogue.

## Adding music

1. Find a recording that meets the rule above. Read its licence page, not only its tag.
2. Convert it: mono or stereo mp3, 72–96 kbps, loudness about −20 LUFS, a short fade in and out (see the ffmpeg line in
   the git history of this file's commit, or use `loudnorm=I=-20:TP=-2` and `afade`).
3. Put it in `public/assets/music/`, add it to `tracks.json` (a piece, or a zone's `files`), add a row to `CREDITS.md`
   and to the credits in `src/ui/overlay.ts`.
4. A new zone needs `id`, `files`, `sites`, `near`, `far`. Keep `far` below about 100 m so the walker leaves it behind.

## Not yet

- A piece by a composer of the place: Čiurlionis (lived in Vilnius 1907–09) or Moniuszko. No free recording was found;
  Musopen (blocked on the network this was built on) may have one.
- A German Street zone of its own (a chorale from the Lutheran church, a brass band) [U]: nothing has been chosen.
